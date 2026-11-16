/* Click-to-play YouTube facades: no third-party load until a visitor presses play. */
(function(){
  function build(el){
    var id=el.getAttribute("data-yt"), t=el.getAttribute("data-title")||"Video";
    var b=document.createElement("button");
    b.type="button"; b.className="vid-play"; b.setAttribute("aria-label","Play video: "+t);
    b.style.backgroundImage="url(https://i.ytimg.com/vi/"+id+"/hqdefault.jpg)";
    b.innerHTML='<span class="vid-btn" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30"><path fill="#fff" d="M8 5v14l11-7z"/></svg></span>';
    b.addEventListener("click",function(){
      var f=document.createElement("iframe");
      f.src="https://www.youtube-nocookie.com/embed/"+id+"?autoplay=1&rel=0";
      f.title=t; f.allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.allowFullscreen=true; f.loading="lazy";
      el.replaceChild(f,b); 
    });
    el.insertBefore(b,el.firstChild);
  }
  function init(){ Array.prototype.forEach.call(document.querySelectorAll(".vid[data-yt]"),build); }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
