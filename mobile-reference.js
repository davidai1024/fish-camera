/* Experimental SpektraLab Hanatos spectral upsampler, GPL-3.0-or-later.
 * Uses original-derived film data, Andrea Volpato, CC BY-SA 4.0.
 * Input: linear ProPhoto RGB. Output: film exposure, not a finished image.
 * https://github.com/JamesQiu2005/SpektraLab
 * https://github.com/andreavolpato/spektrafilm */
(function (root) {
  'use strict';
  function mitchell(t) {
    var x = Math.abs(t), B = 1 / 3, C = 1 / 3;
    if (x < 1) return ((12 - 9*B - 6*C)*x*x*x + (-18 + 12*B + 6*C)*x*x + 6 - 2*B) / 6;
    if (x < 2) return ((-B - 6*C)*x*x*x + (6*B + 30*C)*x*x + (-12*B - 48*C)*x + 8*B + 24*C) / 6;
    return 0;
  }
  function idx(i, len) { if (i < 0) return -i; if (i >= len) return 2*(len-1)-i; return i; }
  function sample(rgb, data) {
    var matrix=data.matrix, table=data.table, n=data.side;
    if (!matrix || matrix.length !== 9 || !table || table.length !== n*n*3 || n < 3) throw new Error('Invalid spectral table');
    var X=matrix[0]*rgb[0]+matrix[1]*rgb[1]+matrix[2]*rgb[2];
    var Y=matrix[3]*rgb[0]+matrix[4]*rgb[1]+matrix[5]*rgb[2];
    var Z=matrix[6]*rgb[0]+matrix[7]*rgb[1]+matrix[8]*rgb[2];
    var bright=X+Y+Z, denom=Math.max(bright,1e-10), x=X/denom, y=Y/denom;
    var xx=Math.max(0,Math.min(1,(1-x)*(1-x)))*(n-1);
    var yy=Math.max(0,Math.min(1,y/Math.max(1-x,1e-10)))*(n-1);
    var xb=Math.min(Math.floor(xx),n-2), yb=Math.min(Math.floor(yy),n-2);
    var xf=xx-xb, yf=yy-yb, out=[0,0,0], sum=0;
    var yw=[mitchell(yf+1-0),mitchell(yf+1-1),mitchell(yf+1-2),mitchell(yf+1-3)];
    var yi=[idx(yb-1,n),idx(yb,n),idx(yb+1,n),idx(yb+2,n)];
    for (var a=0;a<4;a++) { var xw=mitchell(xf+1-a),xi=idx(xb-1+a,n)*n;
     for (var b=0;b<4;b++) {
      var w=xw*yw[b];
      var o=3*(xi+yi[b]);
      sum+=w; out[0]+=w*table[o]; out[1]+=w*table[o+1]; out[2]+=w*table[o+2];
    }
    }
    var k=(Number.isNaN(bright)?0:bright)/(sum || 1);
    return [out[0]*k,out[1]*k,out[2]*k];
  }
  var api={sample:sample};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.PortraSpectral=api;
}(typeof window !== 'undefined' ? window : this));

/* SpektraLab-derived density interpolation, GPL-3.0-or-later.
 * Experimental film stage only; not a complete rendering pipeline. */
(function(root) {
  'use strict';
  function interpolate(v,ch,x,inv,y) {
    var n=x.length/3;
    if (n<2 || x.length!==y.length || inv.length!==(n-1)*3 || ch<0 || ch>2) throw new Error('Invalid curve table');
    if (v<=x[ch]) return y[ch];
    if (v>=x[(n-1)*3+ch]) return y[(n-1)*3+ch];
    var lo=0,hi=n;
    while(lo<hi) { var m=lo+((hi-lo)>>1); if(x[m*3+ch]<=v) lo=m+1; else hi=m; }
    var low=lo-1, t=(v-x[low*3+ch])*inv[low*3+ch];
    return y[low*3+ch]+t*(y[(low+1)*3+ch]-y[low*3+ch]);
  }
  function develop(logRaw,data,useCouplerCurve) {
    var curve=useCouplerCurve?data.coupler_curve_y:data.film_curve_y;
    return [0,1,2].map(function(ch){return interpolate(logRaw[ch],ch,data.film_curve_x,data.film_curve_inv,curve);});
  }
  var api={interpolate:interpolate,develop:develop};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.PortraCurves=api;
}(typeof window!=='undefined'?window:this));

/* SpektraLab-derived separable Gaussian, GPL-3.0-or-later.
 * Experimental CPU parity implementation; not a complete film renderer. */
(function(root){
  'use strict';
  function reflect(i,n){if(n===1)return 0;var p=2*n;i=((i%p)+p)%p;return i<n?i:p-1-i;}
  function kernel(sigma){
    var r=Math.floor(3*sigma+0.5), k=new Float32Array(2*r+1), sum=0, i;
    for(i=-r;i<=r;i++)sum+=Math.exp(-0.5*(i/sigma)*(i/sigma));
    for(i=-r;i<=r;i++)k[i+r]=Math.fround(Math.exp(-0.5*(i/sigma)*(i/sigma))/sum);
    return k;
  }
  function fir(src,w,h,weights,vertical){
    var dst=new Float32Array(src.length),r=(weights.length-1)/2,n=vertical?h:w,taps=weights.length;
    var indices=new Int32Array(n*taps),f=Math.fround,i,k;
    for(i=0;i<n;i++)for(k=0;k<taps;k++)indices[i*taps+k]=reflect(i+k-r,n)*(vertical?w*3:3);
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){
      var a=0,b=0,c=0,base=vertical?x*3:y*w*3,row=(vertical?y:x)*taps;
      for(k=0;k<taps;k++){
        var at=base+indices[row+k],weight=weights[k];
        a=f(a+f(src[at]*weight));b=f(b+f(src[at+1]*weight));c=f(c+f(src[at+2]*weight));
      }
      var out=(y*w+x)*3;dst[out]=a;dst[out+1]=b;dst[out+2]=c;
    }
    return dst;
  }
  function coefficients(s){
    var q=s>=2.5?0.98711*s-0.96330:3.97156-4.14554*Math.sqrt(1-0.26891*s);
    var q2=q*q,q3=q2*q,b0=1.57825+2.44413*q+1.4281*q2+0.422205*q3;
    var b1=2.44413*q+2.85619*q2+1.26661*q3,b2=-(1.4281*q2+1.26661*q3),b3=0.422205*q3;
    return [1-(b1+b2+b3)/b0,b1/b0,b2/b0,b3/b0];
  }
  function iir(src,w,h,b,vertical){
    var dst=new Float32Array(src.length), lines=vertical?w:h, len=vertical?h:w;
    for(var line=0;line<lines;line++)for(var c=0;c<3;c++){
      var base=vertical?line*3+c:line*w*3+c, step=vertical?w*3:3;
      var a=src[base],u=a,v=a, i, z;
      for(i=0;i<len;i++){
        z=b[0]*src[base+i*step]+b[1]*a+b[2]*u+b[3]*v;
        dst[base+i*step]=z;v=u;u=a;a=z;
      }
      a=dst[base+(len-1)*step];u=a;v=a;
      for(i=len-1;i>=0;i--){
        z=b[0]*dst[base+i*step]+b[1]*a+b[2]*u+b[3]*v;
        dst[base+i*step]=z;v=u;u=a;a=z;
      }
    }
    return dst;
  }
  // One reusable channel workspace; accumulation keeps the original Float32 order.
  function channel(src,w,h,sigma,ch,work){
    var n=w*h,a=work.a,b=work.b,x,y,i,k,v;
    for(i=0;i<n;i++)a[i]=src[i*3+ch];
    if(sigma===0)return a;
    var f=Math.fround;
    if(sigma<3){
      var weights=kernel(sigma),taps=weights.length,r=(taps-1)/2;
      var rows=new Int32Array(h*taps),cols=new Int32Array(w*taps);
      for(y=0;y<h;y++)for(k=0;k<taps;k++)rows[y*taps+k]=reflect(y+k-r,h)*w;
      for(x=0;x<w;x++)for(k=0;k<taps;k++)cols[x*taps+k]=reflect(x+k-r,w);
      for(y=0;y<h;y++)for(x=0;x<w;x++){v=0;var row=y*taps;for(k=0;k<taps;k++)v=f(v+f(a[rows[row+k]+x]*weights[k]));b[y*w+x]=v;}
      for(y=0;y<h;y++)for(x=0;x<w;x++){v=0;var col=x*taps,base=y*w;for(k=0;k<taps;k++)v=f(v+f(b[base+cols[col+k]]*weights[k]));a[base+x]=v;}
    }else{
      var co=coefficients(sigma);
      for(var axis=0;axis<2;axis++){
        var input=axis?b:a,output=axis?a:b,lines=axis?w:h,len=axis?h:w;
        for(var line=0;line<lines;line++){
          var base=axis?line:line*w,step=axis?w:1,aa=input[base],u=aa,vv=aa,z;
          for(i=0;i<len;i++){z=co[0]*input[base+i*step]+co[1]*aa+co[2]*u+co[3]*vv;output[base+i*step]=z;vv=u;u=aa;aa=z;}
          aa=output[base+(len-1)*step];u=aa;vv=aa;
          for(i=len-1;i>=0;i--){z=co[0]*output[base+i*step]+co[1]*aa+co[2]*u+co[3]*vv;output[base+i*step]=z;vv=u;u=aa;aa=z;}
        }
      }
    }
    return a;
  }
  function workspace(w,h){return {a:new Float32Array(w*h),b:new Float32Array(w*h)};}
  function gaussian(src,w,h,sigma){
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||!src||src.length!==w*h*3||!Number.isFinite(sigma)||sigma<0)throw new Error('Invalid gaussian input');
    if(sigma===0)return new Float32Array(src);
    var out=new Float32Array(src.length),work=workspace(w,h);
    for(var c=0;c<3;c++){var field=channel(src,w,h,sigma,c,work);for(var i=0;i<field.length;i++)out[i*3+c]=field[i];}
    return out;
  }
  function mixture(src,w,h,components){
    if(!components||!components.length)throw new Error('Empty mixture');
    var out=new Float32Array(src.length),work=workspace(w,h);
    for(var k=0;k<components.length;k++)for(var c=0;c<3;c++){
      var sigma=components[k].sigma[c],weight=components[k].weight[c];
      if(!Number.isFinite(sigma)||sigma<0||!Number.isFinite(weight))throw new Error('Invalid mixture');
      var field=channel(src,w,h,sigma,c,work),g=Math.fround(weight);
      for(var i=0;i<field.length;i++){var at=i*3+c;out[at]=Math.fround(out[at]+field[i]*g);}
    }
    return out;
  }
  function diffusion(src,w,h,size,tail,weight){
    if(!(Number.isFinite(size)&&Number.isFinite(tail)&&Number.isFinite(weight))||size<0||tail<0||weight<0||weight>1)throw new Error('Invalid diffusion settings');
    if(size===0)return new Float32Array(src);
    var sigmas=[size,0.5360*tail,1.5236*tail,2.7684*tail],gains=[1-weight,0.1633*weight,0.6496*weight,0.1870*weight];
    var out=new Float32Array(src.length),work=workspace(w,h);
    for(var j=0;j<sigmas.length;j++)for(var c=0;c<3;c++){
      var field=channel(src,w,h,sigmas[j],c,work),g=Math.fround(gains[j]);
      for(var i=0;i<field.length;i++){var at=i*3+c;out[at]=Math.fround(out[at]+field[i]*g);}
    }
    return out;
  }
  var api={gaussian:gaussian,diffusion:diffusion,mixture:mixture};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PortraBlur=api;
}(typeof window!=='undefined'?window:this));

/* SpektraLab-derived negative development, GPL-3.0-or-later.
 * Requires PortraCurves and PortraBlur; film data CC BY-SA 4.0, Andrea Volpato.
 * Input is log10 film exposure, not RGB; output is negative density. */
(function(root){'use strict';
 var curves=typeof module!=='undefined'&&module.exports?require('./portra_curves.js'):root.PortraCurves;
 var blur=typeof module!=='undefined'&&module.exports?require('./portra_blur.js'):root.PortraBlur;
 function develop(logRaw,w,h,data,settings,consume){
  if(!logRaw||logRaw.length!==w*h*3||!data||!data.coupler_matrix||data.coupler_matrix.length!==9)throw new Error('Invalid negative input');
  var correction=new Float32Array(logRaw.length);
  var m=data.coupler_matrix,i,c;
  for(i=0;i<logRaw.length;i+=3){
   var d=curves.develop([logRaw[i],logRaw[i+1],logRaw[i+2]],data,false);
   for(c=0;c<3;c++)d[c]=Math.fround(d[c]);
   for(c=0;c<3;c++)correction[i+c]=d[0]*m[c]+d[1]*m[3+c]+d[2]*m[6+c];
  }
  settings=settings||{};
  if(settings.size>0)correction=blur.diffusion(correction,w,h,settings.size,settings.tail,settings.weight);
  var result=consume?logRaw:new Float32Array(logRaw.length);
  for(i=0;i<logRaw.length;i+=3){
   var adjusted=[Math.fround(logRaw[i]-correction[i]),Math.fround(logRaw[i+1]-correction[i+1]),Math.fround(logRaw[i+2]-correction[i+2])];
   var developed=curves.develop(adjusted,data,true);
   for(c=0;c<3;c++)result[i+c]=developed[c];
  }
  return result;
 }
 var api={develop:develop};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PortraNegative=api;
}(typeof window!=='undefined'?window:this));

/* Experimental SpektraLab-derived print spectral integrals, GPL-3.0-or-later.
 * Original derived film/paper data: Andrea Volpato, CC BY-SA 4.0.
 * Input is negative film density, output is linear scan XYZ. Not a complete renderer. */
(function(root) {
  'use strict';
  function integral(cmy,chd,base,ixs,gain,offset,logOut) {
    if(chd.length!==base.length*3||ixs.length!==base.length*3) throw new Error('Invalid spectral integral');
    var v=[0,0,0];
    for(var i=0;i<base.length;i++) {
      var j=i*3,d=cmy[0]*chd[j]+cmy[1]*chd[j+1]+cmy[2]*chd[j+2]+base[i];
      var trans=Math.pow(10,-d);
      v[0]+=trans*ixs[j];v[1]+=trans*ixs[j+1];v[2]+=trans*ixs[j+2];
    }
    for(var c=0;c<3;c++) {
      v[c]=Math.max(v[c]*gain[c]+offset[c],0)+1e-10;
      if(logOut) v[c]=Math.log(v[c])*Math.LOG10E;
    }
    return v;
  }
  function printAndScan(cmy,data,curves) {
    var raw=integral(cmy,data.print_chd,data.print_base,data.print_ixs,data.print_gain,data.print_offset,true);
    var paper=[0,1,2].map(function(c){return curves.interpolate(raw[c],c,data.paper_curve_x,data.paper_curve_inv,data.paper_curve_y);});
    return integral(paper,data.scan_chd,data.scan_base,data.scan_ixs,[1,1,1],[0,0,0],false);
  }
  var api={integral:integral,printAndScan:printAndScan};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.PortraPrint=api;
}(typeof window!=='undefined'?window:this));

/* SpektraLab-derived halation/scatter, GPL-3.0-or-later.
 * Experimental CPU stage. Supports the original Gaussian bounce path only. */
(function(root){'use strict';
 var blur=typeof module!=='undefined'&&module.exports?require('./portra_blur.js'):root.PortraBlur;
 function apply(src,w,h,p,pixelSize,consume){
  if(!p||!Number.isFinite(pixelSize)||pixelSize<=0)throw new Error('Invalid halation parameters');
  if(!p.active)return new Float32Array(src);
  if(p.backReflection)throw new Error('Back-reflection model not implemented');
  var out=consume?src:new Float32Array(src),c,i,k;
  var scale=p.scatterSpatialScale||1, components=[],core={sigma:[],weight:[]};
  var tailW=p.scatterTailWeight, tail=p.scatterTailUm, any=false;
  for(c=0;c<3;c++){
   core.sigma[c]=Math.max(p.scatterCoreUm[c]*scale/pixelSize,1e-6);core.weight[c]=1-tailW[c];
   any=any||p.scatterCoreUm[c]>0||tail[c]>0;
  }
  if(p.scatterAmount>0&&any){
   components.push(core);var fits=[[0.1633,0.5360],[0.6496,1.5236],[0.1870,2.7684]];
   for(k=0;k<fits.length;k++){
    var term={sigma:[],weight:[]};
    for(c=0;c<3;c++){term.sigma[c]=Math.max(tail[c]*scale/pixelSize,1e-6)*fits[k][1];term.weight[c]=tailW[c]*fits[k][0];}
    components.push(term);
   }
   var scatter=blur.mixture(out,w,h,components),s=p.scatterAmount;
   for(i=0;i<out.length;i++)out[i]=Math.fround(Math.fround(out[i]*Math.fround(1-s))+scatter[i]*Math.fround(s));
   scatter=null;
  }
  var n=p.bounces, amount=p.halationAmount,radius=Math.sqrt(Math.max(amount,0)),strength=p.strength;
  var sum=0,decay=[];components=[];
  for(k=0;k<n;k++){decay[k]=Math.pow(p.bounceDecay,k);sum+=decay[k];}
  if(n>0&&sum>0&&amount>0){
   for(k=0;k<n;k++){
    var bounce={sigma:[],weight:[]};
    for(c=0;c<3;c++){
     bounce.sigma[c]=Math.max(p.firstSigmaUm[c]*p.halationSpatialScale*radius/pixelSize*Math.sqrt(k+1),1e-6);
     bounce.weight[c]=decay[k]/sum;
    }
    components.push(bounce);
   }
   var halo=blur.mixture(out,w,h,components);
   for(i=0;i<out.length;i++){
    c=i%3;var a=Math.fround(Math.fround(strength[c])*Math.fround(amount));
    var x=p.renormalize?1/(1+a):1, y=p.renormalize?a/(1+a):a;
    out[i]=Math.fround(Math.fround(out[i]*Math.fround(x))+halo[i]*Math.fround(y));
   }
  }
  return out;
 }
 var api={apply:apply};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PortraHalation=api;
}(typeof window!=='undefined'?window:this));

/* SpektraLab-derived Philox 4x32-10; GPL-3.0-or-later.
 * Experimental RNG primitive only, not a complete film-grain simulation.
 * https://github.com/JamesQiu2005/SpektraLab */
(function (root) {
  'use strict';
  function multiplyHigh(a, b) {
    var a0 = a & 65535, a1 = a >>> 16, b0 = b & 65535, b1 = b >>> 16;
    var low = a0 * b0;
    var middle = (low >>> 16) + a1 * b0 + a0 * b1;
    var high = (a1 * b1 + Math.floor(middle / 65536)) >>> 0;
    return high;
  }
  function philox(counter, key) {
    var c0 = counter[0] >>> 0, c1 = counter[1] >>> 0;
    var c2 = counter[2] >>> 0, c3 = counter[3] >>> 0;
    var k0 = key[0] >>> 0, k1 = key[1] >>> 0;
    for (var r = 0; r < 10; r++) {
      var hi0 = multiplyHigh(0xD2511F53, c0), hi1 = multiplyHigh(0xCD9E8D57, c2);
      var lo0 = Math.imul(0xD2511F53, c0) >>> 0, lo1 = Math.imul(0xCD9E8D57, c2) >>> 0;
      var n0 = (hi1 ^ c1 ^ k0) >>> 0, n2 = (hi0 ^ c3 ^ k1) >>> 0;
      c0 = n0; c1 = lo1; c2 = n2; c3 = lo0;
      k0 = (k0 + 0x9E3779B9) >>> 0; k1 = (k1 + 0xBB67AE85) >>> 0;
    }
    return [c0, c1, c2, c3];
  }
  var api = {philox:philox};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PortraPhilox = api;
}(typeof window !== 'undefined' ? window : this));

/* SpektraLab grain kernel translation; GPL-3.0-or-later.
 * Experimental core only: profile preparation and grain tail not implemented. */
(function(root){'use strict';
 var lib=typeof module!=='undefined'&&module.exports?require('./portra_philox.js'):root.PortraPhilox;
 var f=Math.fround;
 function random(pixel,stream,seed){var ctr=0,buf=[],idx=4;return function(){if(idx===4){buf=lib.philox([pixel,stream,ctr++,0],[seed,0]);idx=0;}return f(f((buf[idx++]>>>8)+0.5)/16777216);};}
 function loggam(x){
  var a=[f(8.333333333333333e-2),f(-2.777777777777778e-3),f(7.936507936507937e-4),f(-5.952380952380952e-4),f(8.417508417508418e-4)],x0=x,n=0;
  if(x===1||x===2)return 0;if(x<=7){n=Math.trunc(7-x);x0=f(x+n);}var x2=f(1/f(x0*x0)),v=a[4];
  for(var i=3;i>=0;i--)v=f(f(v*x2)+a[i]);
  var gl=f(f(f(f(v/x0)+f(0.5*f(Math.log(f(6.283185307179586)))))+f(f(x0-0.5)*f(Math.log(x0))))-x0);
  if(x<=7)for(var j=0;j<n;j++){gl=f(gl-f(Math.log(f(x0-1))));x0=f(x0-1);}return gl;
 }
 function poisson(next,mu){
  if(mu>=10){var slam=f(Math.sqrt(mu)),loglam=f(Math.log(mu)),b=f(f(0.931)+f(f(2.53)*slam)),a=f(f(-0.059)+f(f(0.02483)*b)),ia=f(f(1.1239)+f(f(1.1328)/f(b-f(3.4)))),vr=f(f(0.9277)-f(f(3.6224)/f(b-2)));
   for(var i=0;i<64;i++){var U=f(next()-0.5),V=next(),us=f(0.5-Math.abs(U));var k=Math.floor(f(f(f(f(f(2*a)/us)+b)*U)+f(mu+f(0.43))));
    if(us>=f(.07)&&V<=vr)return k;if(k<0||(us<f(.013)&&V>us))continue;
    var lhs=f(f(f(Math.log(V))+f(Math.log(ia)))-f(Math.log(f(f(a/f(us*us))+b))));
    var rhs=f(f(-mu+f(k*loglam))-loggam(f(k+1)));if(lhs<=rhs)return k;
   }return Math.floor(mu);
  }
  var limit=f(Math.exp(-mu)),prod=1,X=0;for(var j=0;j<512;j++){prod=f(prod*next());if(prod>limit)X++;else return X;}return X;
 }
 function draw(next,d,dmax,n,u){var p=f(d/dmax);p=Math.min(f(1-f(1e-6)),Math.max(f(1e-6),p));var sat=f(1-f(f(p*u)*f(1-f(1e-6))));var rate=f(f(n/sat)*p),od=f(dmax/n);return f(poisson(next,rate)*f(od*sat));}
 function simple(input,lp,streams,nsub,seed){if(!input||input.length%3||lp.length!==12||streams.length!==3||nsub<1)throw Error('Invalid grain input');var out=new Float32Array(input.length);
  for(var i=0;i<input.length/3;i++)for(var c=0;c<3;c++){var d=f(input[3*i+c]+lp[4*c]),sum=0;for(var sl=0;sl<nsub;sl++)sum=f(sum+draw(random(i,(streams[c]+sl*10)>>>0,seed>>>0),d,lp[4*c+1],lp[4*c+2],lp[4*c+3]));out[3*i+c]=sum;}return out;
 }
 function layers(input,xa,inv,ylay,lp,streams,seed,positive,layer){
  if(!input||input.length%3||xa.length%3||xa.length<6||(inv.length!==xa.length-3&&inv.length!==xa.length)||ylay.length!==xa.length*3||lp.length!==36||streams.length!==9)throw Error('Invalid grain layers input');
  if(layer!==undefined&&(layer<0||layer>2||layer!==Math.floor(layer)))throw Error('Invalid layer');
  var K=xa.length/3,out=new Float32Array(input.length);
  for(var i=0;i<input.length/3;i++)for(var ch=0;ch<3;ch++){
   var v=positive?-input[i*3+ch]:input[i*3+ch],lo=0,mode=0,t=0;
   if(v<=xa[ch])mode=0;else if(v>=xa[(K-1)*3+ch])mode=1;else{var left=0,right=K;while(left<right){var mid=(left+right)>>1;if(xa[mid*3+ch]<=v)left=mid+1;else right=mid;}lo=left-1;t=f(f(v-xa[lo*3+ch])*inv[lo*3+ch]);mode=2;}
   var acc=0;for(var sl=0;sl<3;sl++){if(layer!==undefined&&layer!==sl)continue;var col=ch*3+sl,d;if(mode===0)d=ylay[col];else if(mode===1)d=ylay[(K-1)*9+col];else{var y0=ylay[lo*9+col],y1=ylay[(lo+1)*9+col];d=f(y0+f(t*f(y1-y0)));}d=f(d+lp[col*4]);acc=f(acc+draw(random(i,streams[col],seed),d,lp[col*4+1],lp[col*4+2],lp[col*4+3]));}out[i*3+ch]=acc;
  }return out;
 }
 var api={simple:simple,layers:layers};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PortraGrain=api;
}(typeof window!=='undefined'?window:this));

/* SpektraLab-derived grain stage. GPL-3.0-or-later.
 * Film profile data: Andrea Volpato, CC BY-SA 4.0. Experimental CPU implementation. */
(function(root){'use strict';var node=typeof module!=='undefined'&&module.exports;
 var grain=node?require('./portra_grain.js'):root.PortraGrain,lib=node?require('./portra_philox.js'):root.PortraPhilox,blur=node?require('./portra_blur.js'):root.PortraBlur,f=Math.fround;
 function profile(data,px){if(!data||!data.grain_axis||!data.grain_y||!data.grain_inv||!(px>0))throw Error('Invalid grain profile');
  var y=data.grain_y,K=data.grain_axis.length/3,max=[],total=[0,0,0],lp=new Float32Array(36),sigma=[],pc=[1.6,1.6,3.2],ps=[2,1,.5],uniformity=[.97,.99,.97];
  for(var c=0;c<3;c++)for(var s=0;s<3;s++){var col=c*3+s,m=0;for(var k=0;k<K;k++)m=Math.max(m,y[k*9+col]);max[col]=m;total[c]+=m;}
  for(c=0;c<3;c++)for(s=0;s<3;s++){col=c*3+s;var fraction=max[col]/total[c],minimum=fraction*.03,dmax=max[col]+minimum,n=px*px*fraction/(.2*pc[c]*ps[s]);if(!(n>0&&dmax>0))throw Error('Invalid particle density');lp[col*4]=minimum;lp[col*4+1]=dmax;lp[col*4+2]=n;lp[col*4+3]=uniformity[c];sigma[col]=Math.sqrt(dmax/n);}
  return {lp:lp,sigma:sigma};
 }
 function field(w,h,sigma,seed){var out=new Float32Array(w*h*3),sig=f(Math.sqrt(f(Math.log(f(1+f(sigma*sigma)))))),mu=f(-f(f(.5*sig)*sig));for(var i=0;i<w*h;i++)for(var c=0;c<3;c++){var r=lib.philox([i,100+c,0,0],[seed,0]);var u1=f(f((r[0]>>>8)+.5)/16777216),u2=f(f((r[1]>>>8)+.5)/16777216),normal=f(f(Math.sqrt(f(-2*f(Math.log(u1)))))*f(Math.cos(f(6.283185307179586*u2))));out[3*i+c]=f(Math.exp(f(mu+f(sig*normal))));}return out;}
 function apply(input,w,h,data,px,seed){if(!input||input.length!==w*h*3)throw Error('Invalid grain image');seed=seed>>>0;var p=profile(data,px),streams=[0,10,20,1,11,21,2,12,22],args=[input,data.grain_axis,data.grain_inv,data.grain_y,p.lp,streams,seed,false],hasCloud=p.sigma.some(function(s){return s>.4;}),out,i,c;
  if(!hasCloud)out=grain.layers.apply(null,args);else {out=new Float32Array(input.length);for(var sl=0;sl<3;sl++){var layer=grain.layers.apply(null,args.concat([sl]));for(c=0;c<3;c++){var sigma=p.sigma[c*3+sl],tmp=sigma>.4?blur.gaussian(layer,w,h,sigma):layer;for(i=c;i<out.length;i+=3)out[i]=f(out[i]+tmp[i]);}}}
  var micro=.03/px,blurPx=.2/px;if(micro>.05){var fld=field(w,h,micro,seed);if(blurPx>.4)fld=blur.gaussian(fld,w,h,blurPx);for(i=0;i<out.length;i++)out[i]=f(out[i]*fld[i]);}
  for(i=0;i<out.length;i++)out[i]=f(out[i]-.03);out=blur.gaussian(out,w,h,.65);return out;
 }
 var api={profile:profile,field:field,apply:apply};if(node)module.exports=api;else root.PortraGrainStage=api;
}(typeof window!=='undefined'?window:this));

/* SpektraLab-derived paper veiling glare, GPL-3.0-or-later. */
(function(root){'use strict';
 var node=typeof module!=='undefined'&&module.exports;
 var rng=node?require('./portra_philox.js'):root.PortraPhilox;
 var blur=node?require('./portra_blur.js'):root.PortraBlur;
 function field(w,h,mean,std,seed,stream){
  if(!(w>0&&h>0&&mean>0&&std>=0))throw new Error('Invalid glare field');
  var m=Math.fround(mean),s=Math.fround(std),f=Math.fround;
  var sig=f(Math.sqrt(f(Math.log(f(1+f(f(s*s)/f(m*m))))))),mu=f(f(Math.log(m))-f(f(0.5*sig)*sig));
  var out=new Float32Array(w*h*3);
  for(var i=0;i<w*h;i++){
   var r=rng.philox([i,stream,0,0],[seed,0]);
   var u1=f(f((r[0]>>>8)+0.5)/16777216),u2=f(f((r[1]>>>8)+0.5)/16777216);
   var normal=f(f(Math.sqrt(f(-2*f(Math.log(u1)))))*f(Math.cos(f(6.283185307179586*u2))));
   var v=f(Math.exp(f(mu+f(sig*normal))));out[i*3]=out[i*3+1]=out[i*3+2]=v;
  }
  return out;
 }
 function apply(xyz,w,h,p,illum,seed,consume){
  if(!xyz||xyz.length!==w*h*3||!p||!illum||illum.length!==3)throw new Error('Invalid glare input');
  if(!p.active||p.percent*p.amount<=0)return new Float32Array(xyz);
  var percent=p.percent*p.amount;
  var f=field(w,h,percent,p.roughness*percent,seed>>>0,200);
  var sigma=p.blur*(p.tierRatio||1)*Math.sqrt(Math.max(p.amount,0));
  if(sigma>0)f=blur.gaussian(f,w,h,sigma);
  var out=consume?xyz:new Float32Array(xyz.length);
  for(var i=0;i<out.length;i++)out[i]=Math.fround(xyz[i]+Math.fround(Math.fround(f[i]/100)*Math.fround(illum[i%3])));
  return out;
 }
 var api={field:field,apply:apply};if(node)module.exports=api;else root.PortraGlare=api;
}(typeof window!=='undefined'?window:this));

/* SpektraLab-derived matrix and transfer functions. GPL-3.0-or-later.
 * Experimental: excludes CAM16 gamut compression and scanner blur. */
(function(root){'use strict';var f=Math.fround;
 function matrix(input,m,consume){if(!input||input.length%3||!m||m.length!==9)throw Error('Invalid colour matrix');var out=consume?input:new Float32Array(input.length);for(var i=0;i<input.length;i+=3){var r=input[i],g=input[i+1],b=input[i+2];for(var c=0;c<3;c++)out[i+c]=f(f(f(r*m[c*3])+f(g*m[c*3+1]))+f(b*m[c*3+2]));}return out;}
 function encode(v,mode){if(mode==='prophoto')return v<1/512?f(v*16):f(Math.pow(v,1/1.8));if(mode==='srgb')return v<=f(.0031308)?f(f(12.92)*v):f(f(f(1.055)*f(Math.pow(v,f(1/2.4))))-f(.055));throw Error('Unknown colour space');}
 function decode(v,mode){if(mode==='prophoto')return v<1/32?f(v/16):f(Math.pow(v,1.8));if(mode==='srgb')return v<=f(.040449936)?f(v/f(12.92)):f(Math.pow(f(f(v+f(.055))/f(1.055)),f(2.4)));throw Error('Unknown colour space');}
 function transfer(input,mode,encodeValue,consume){var out=consume?input:new Float32Array(input.length);for(var i=0;i<input.length;i++)out[i]=encodeValue?encode(input[i],mode):decode(input[i],mode);return out;}
 var api={matrix:matrix,transfer:transfer};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PortraColor=api;
}(typeof window!=='undefined'?window:this));

/* SpektraLab CAM16-UCS gamut compression translation, GPL-3.0-or-later.
 * Experimental CPU implementation, using baked original CAM16 profile. */
(function(root){'use strict';
 function compress(input,data,consume){if(!input||input.length%3||!data||!data.cam16_k||data.cam16_cmax.length!==64*720)throw Error('Invalid CAM16 input');var k=data.cam16_k,m=data.cam16_m2x,ir=data.cam16_m2r,cm=data.cam16_cmax,out=consume?input:new Float32Array(input.length);
 var FL=k[0],Nbb=k[1],Ncb=k[2],n=k[3],z=k[4],Aw=k[5],c=k[6],Nc=k[7],L0=k[8],L1=k[9],h0=k[10],hs=k[11],th=k[12],lim=k[13],power=k[14],lt=k[15],ll=k[16],lp=k[17],Lw=k[18],D=[k[19],k[20],k[21]],ec=Math.pow(1.64-Math.pow(.29,n),.73),fl4=Math.pow(FL,.25);
 function response(v){var t=Math.pow(FL*Math.abs(v)/100,.42);return 400*(v>=0?1:-1)*t/(27.13+t)+.1;}
 function inverse(v,dd){var vm=v-.1,base=Math.abs(vm)<400?27.13*Math.abs(vm)/(400-Math.abs(vm)):0;return 100/FL*(vm>=0?1:-1)*Math.pow(base,1/.42)/dd;}
 for(var i=0;i<input.length;i+=3){var r=input[i],g=input[i+1],b=input[i+2],X=100*(m[0]*r+m[1]*g+m[2]*b),Y=100*(m[3]*r+m[4]*g+m[5]*b),Z=100*(m[6]*r+m[7]*g+m[8]*b);
  var R=.401288*X+.650173*Y-.051461*Z,G=-.250268*X+1.204414*Y+.045854*Z,B=-.002079*X+.048952*Y+.953127*Z,Ra=response(D[0]*R),Ga=response(D[1]*G),Ba=response(D[2]*B);
  var a=Ra-12*Ga/11+Ba/11,bb=(Ra+Ga-2*Ba)/9,h=Math.atan2(bb,a),et=.25*(Math.cos(h+2)+3.8),A=(2*Ra+Ga+Ba/20-.305)*Nbb,ar=A/Aw,J=100*(ar>=0?1:-1)*Math.pow(Math.abs(ar),c*z),den=Ra+Ga+21*Ba/20,t=den!==0?(50000/13*Nc*Ncb*et*Math.sqrt(a*a+bb*bb))/den:0;
  var C=t>0?Math.pow(t,.9)*Math.sqrt(Math.abs(J)/100)*ec:0,M=C*fl4,Mp=Math.log(1+.0228*M)/.0228,Jp=1.7*J/(1+.007*J),Ln=Jp/Lw;if(Ln>lt){var lsc=ll-lt,lx=(Ln-lt)/lsc;Ln=lt+lsc*lx/Math.pow(1+Math.pow(lx,lp),1/lp);}Jp=Ln*Lw;
  var Lc=Math.min(Math.max(Jp,L0),L1),Li=(Lc-L0)/(L1-L0)*63,lbase=Math.min(Math.max(Math.floor(Li),0),62),lf=Li-lbase,hi=(h-h0)/hs,hfl=Math.floor(hi),hb=((hfl%720)+720)%720,hb1=(hb+1)%720,hf=hi-hfl;
  var Cmax=(1-lf)*((1-hf)*cm[lbase*720+hb]+hf*cm[lbase*720+hb1])+lf*((1-hf)*cm[(lbase+1)*720+hb]+hf*cm[(lbase+1)*720+hb1]),safe=Math.max(Cmax,1e-9),dd=Mp/safe;if(dd>th){var sc=lim-th,xk=(dd-th)/sc;dd=th+sc*xk/Math.pow(1+Math.pow(xk,power),1/power);}
  var Mn=(Math.exp(dd*safe*.0228)-1)/.0228,Jn=Jp/(1.7-.007*Jp),Cn=Mn/fl4,A2=Aw*(Jn>=0?1:-1)*Math.pow(Math.abs(Jn)/100,1/(c*z)),sq=Math.sqrt(Math.abs(Jn)/100),t2=sq>0&&Cn>0?Math.pow(Cn/(sq*ec),1/.9):0,ca=Math.cos(h),sa=Math.sin(h),p2=A2/Nbb+.305,p3=21/20,a2=0,b2=0;
  if(t2!==0){var p1=(50000/13*Nc*Ncb*et)/t2;if(Math.abs(sa)>=Math.abs(ca)){var p4=p1/sa;b2=(p2*(2+p3)*(460/1403))/(p4+(2+p3)*(220/1403)*(ca/sa)-27/1403+p3*(6300/1403));a2=b2*ca/sa;}else{var p5=p1/ca;a2=(p2*(2+p3)*(460/1403))/(p5+(2+p3)*(220/1403)-(27/1403-p3*(6300/1403))*sa/ca);b2=a2*sa/ca;}}
  var Ra2=(460*p2+451*a2+288*b2)/1403,Ga2=(460*p2-891*a2-261*b2)/1403,Ba2=(460*p2-220*a2-6300*b2)/1403,Rf=inverse(Ra2,D[0]),Gf=inverse(Ga2,D[1]),Bf=inverse(Ba2,D[2]),Xn=(1.86206786*Rf-1.01125463*Gf+.14918677*Bf)/100,Yn=(.38752654*Rf+.62144744*Gf-.00897398*Bf)/100,Zn=(-.0158415*Rf-.03412294*Gf+1.04996444*Bf)/100;
  out[i]=ir[0]*Xn+ir[1]*Yn+ir[2]*Zn;out[i+1]=ir[3]*Xn+ir[4]*Yn+ir[5]*Zn;out[i+2]=ir[6]*Xn+ir[7]*Yn+ir[8]*Zn;
 }return out;}
 var api={compress:compress};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PortraCam16=api;
}(typeof window!=='undefined'?window:this));

/*
 * Experimental SpektraLab-derived metering module; NOT a complete film engine.
 * Based on SpektraLab 1.3.5 pipeline.cpp legacy_exposure_ev and exposure_sample_y.
 * SpektraLab is GPL-3.0-or-later: https://github.com/JamesQiu2005/SpektraLab
 * Input is linear ProPhoto RGB (float triples), not ordinary sRGB image bytes.
 * No image leaves this device. The caller must provide correctly decoded data.
 */
(function (root) {
  'use strict';
  var YR = 0.288, YG = 0.7119, YB = 0.0001;
  function mirror(i, n) {
    if (n === 1) return 0;
    var period = 2 * (n - 1);
    i = ((i % period) + period) % period;
    return i >= n ? period - i : i;
  }
  function filterAxis(src, width, height, axis, sigma) {
    var radius = Math.floor(4 * sigma + 0.5);
    if (!radius) return src;
    var weights = [], sum = 0, i, j, x, y, c;
    for (i = -radius; i <= radius; i++) {
      var w = Math.exp(-0.5 * i * i / (sigma * sigma));
      weights.push(w); sum += w;
    }
    for (i = 0; i < weights.length; i++) weights[i] = Math.fround(weights[i] / sum);
    var out = new Float32Array(src.length);
    for (y = 0; y < height; y++) for (x = 0; x < width; x++) for (c = 0; c < 3; c++) {
      var acc = 0;
      for (j = -radius; j <= radius; j++) {
        var xx = axis === 1 ? mirror(x + j, width) : x;
        var yy = axis === 0 ? mirror(y + j, height) : y;
        acc += src[(yy * width + xx) * 3 + c] * weights[j + radius];
      }
      out[(y * width + x) * 3 + c] = acc;
    }
    return out;
  }
  function meterImage(src, width, height) {
    var edge = Math.max(width, height);
    if (edge <= 1600) return { pixels: src, width: width, height: height };
    var scale = 1600 / edge;
    var outW = Math.max(1, Math.floor(width * scale));
    var outH = Math.max(1, Math.floor(height * scale));
    var factorY = height / outH, factorX = width / outW;
    var data = filterAxis(src, width, height, 0, Math.max(0, (factorY - 1) / 2));
    data = filterAxis(data, width, height, 1, Math.max(0, (factorX - 1) / 2));
    var out = new Float32Array(outW * outH * 3);
    for (var y = 0; y < outH; y++) for (var x = 0; x < outW; x++) {
      var sy = Math.abs((y + 0.5) * factorY - 0.5);
      var sx = Math.abs((x + 0.5) * factorX - 0.5);
      var ya = mirror(Math.floor(sy), height), yb = mirror(Math.floor(sy) + 1, height);
      var xa = mirror(Math.floor(sx), width), xb = mirror(Math.floor(sx) + 1, width);
      var ty = Math.fround(sy - Math.floor(sy)), tx = Math.fround(sx - Math.floor(sx));
      for (var c = 0; c < 3; c++) {
        var a = data[(ya * width + xa) * 3 + c], b = data[(ya * width + xb) * 3 + c];
        var d = data[(yb * width + xa) * 3 + c], e = data[(yb * width + xb) * 3 + c];
        var top = Math.fround(a + tx * (b - a)), bottom = Math.fround(d + tx * (e - d));
        out[(y * outW + x) * 3 + c] = top + ty * (bottom - top);
      }
    }
    return { pixels: out, width: outW, height: outH };
  }
  function exposureEV(linearProPhoto, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        !linearProPhoto || linearProPhoto.length !== width * height * 3) {
      throw new Error('Expected a nonempty linear ProPhoto RGB image');
    }
    var frame = meterImage(linearProPhoto, width, height);
    linearProPhoto = frame.pixels; width = frame.width; height = frame.height;
    var edge = Math.max(width, height), normW = width / edge, normH = height / edge;
    var weighted = 0, mass = 0, x, y;
    var wx = new Float64Array(width);
    var wy = new Float64Array(height);
    for (x = 0; x < width; x++) {
      var dx = (x / width - 0.5) * normW;
      wx[x] = Math.exp(-(dx * dx) / 0.08);
    }
    for (y = 0; y < height; y++) {
      var dy = (y / height - 0.5) * normH;
      wy[y] = Math.exp(-(dy * dy) / 0.08);
    }
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        var p = (y * width + x) * 3, w = wx[x] * wy[y];
        var luminance = YR * linearProPhoto[p] + YG * linearProPhoto[p + 1] + YB * linearProPhoto[p + 2];
        weighted += luminance * w;
        mass += w;
      }
    }
    var ev = -Math.log2((weighted / mass) / 0.184);
    return Number.isFinite(ev) ? ev : 0;
  }
  var api = { exposureEV: exposureEV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PortraMeter = api;
}(typeof window !== 'undefined' ? window : this));

/* Experimental partial SpektraLab pipeline. GPL-3.0-or-later.
 * Film/paper data Andrea Volpato CC BY-SA 4.0. Not the complete original engine:
 * does not implement full decoding, complete input handling, or final export gamut. */
(function(root){'use strict';
 var node=typeof module!=='undefined'&&module.exports;
 var spectral=node?require('./portra_spectral.js'):root.PortraSpectral;
 var negative=node?require('./portra_negative.js'):root.PortraNegative;
 var print=node?require('./portra_print.js'):root.PortraPrint;
 var curves=node?require('./portra_curves.js'):root.PortraCurves;
 var halation=node?require('./portra_halation.js'):root.PortraHalation;
 var glare=node?require('./portra_glare.js'):root.PortraGlare;
 var grain=node?require('./portra_grain_stage.js'):root.PortraGrainStage;
 var colour=node?require('./portra_color.js'):root.PortraColor;
 var cam16=node?require('./portra_cam16.js'):root.PortraCam16;
 var blur=node?require('./portra_blur.js'):root.PortraBlur;
 function renderLinearProPhoto(input,w,h,data,settings){
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||!input||input.length!==w*h*3)throw new Error('Invalid linear ProPhoto image');
  settings=settings||{};var exposure=input,logRaw,i,c;
  var gain=typeof settings.exposureGain==='number'?settings.exposureGain:1;
  if(!Number.isFinite(gain)||gain<=0)throw new Error('Invalid exposure');
  for(i=0;i<input.length;i+=3){
   var raw=spectral.sample([input[i]*gain,input[i+1]*gain,input[i+2]*gain],data);
   for(c=0;c<3;c++)exposure[i+c]=raw[c];
  }
  if(settings.halation)exposure=halation.apply(exposure,w,h,settings.halation,settings.pixelSize,true);
  logRaw=exposure;
  for(i=0;i<exposure.length;i++)logRaw[i]=Math.log(Math.max(exposure[i],0)+1e-10)*Math.LOG10E;
  var density=negative.develop(logRaw,w,h,data,settings,true);
  if(settings.grain)density=grain.apply(density,w,h,data,settings.pixelSize,settings.grainSeed||0);
  var xyz=density;
  for(i=0;i<density.length;i+=3){
   var v=print.printAndScan([density[i],density[i+1],density[i+2]],data,curves);
   for(c=0;c<3;c++)xyz[i+c]=v[c];
  }
  if(settings.glare)xyz=glare.apply(xyz,w,h,settings.glare,settings.glareIlluminant,settings.glareSeed||0,true);
  return xyz;
 }
 function scanProPhoto(xyz,w,h,data,settings){
  if(!xyz||xyz.length!==w*h*3)throw Error('Invalid scan image');settings=settings||{};
  var rgb=colour.matrix(xyz,data.xyz_to_rgb,true);
  if(settings.gamut!==false)rgb=cam16.compress(rgb,data,true);
  var sigma=typeof settings.unsharpSigma==='number'?settings.unsharpSigma:.7,amount=typeof settings.unsharpAmount==='number'?settings.unsharpAmount:.7;
  if(sigma>0&&amount>0){var blurred=blur.gaussian(rgb,w,h,sigma);for(var i=0;i<rgb.length;i++)rgb[i]=Math.fround(Math.fround(rgb[i]*Math.fround(1+amount))-Math.fround(blurred[i]*Math.fround(amount)));}
  return colour.transfer(colour.matrix(rgb,data.prophoto_identity,true),'prophoto',true,true);
 }
 var api={renderLinearProPhoto:renderLinearProPhoto,scanProPhoto:scanProPhoto};if(node)module.exports=api;else root.PortraPartialPipeline=api;
}(typeof window!=='undefined'?window:this));

