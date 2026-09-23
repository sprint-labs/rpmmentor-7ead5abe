/**
 * Style for the splash below.
 *
 * It is a string the root shell inlines into `<head>` rather than a rule in
 * `styles.css`, because the splash has to paint before any stylesheet arrives.
 */
export const bootSplashCss = `
#boot-splash{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:#0D0D0D;transition:opacity .35s ease-out;opacity:1;pointer-events:auto}
#boot-splash[data-hide="1"]{opacity:0;pointer-events:none}
#boot-splash .bs-wrap{display:flex;flex-direction:column;align-items:center;gap:40px}
#boot-splash .bs-mark{position:relative;width:134px;height:154px}
#boot-splash .bs-glow{position:absolute;left:50%;top:50%;width:380px;height:380px;margin:-190px 0 0 -190px;border-radius:50%;background:radial-gradient(circle,rgba(18,196,0,.22) 0%,rgba(18,196,0,.06) 38%,rgba(18,196,0,0) 62%);pointer-events:none;animation:bs-glow 2.2s ease-in-out infinite}
#boot-splash .bs-base{position:absolute;left:0;top:0;width:134px;height:154px;object-fit:contain;opacity:.16}
#boot-splash .bs-fill{display:none;position:absolute;left:0;top:0;width:134px;height:154px;background:linear-gradient(to bottom,rgba(18,196,0,0) 0%,rgba(18,196,0,0) 50%,#12C400 58%,#12C400 100%);background-size:100% 240%;background-repeat:no-repeat;-webkit-mask-image:url(/gkhq-mark.png);mask-image:url(/gkhq-mark.png);-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;animation:bs-rise 2.2s cubic-bezier(.45,0,.2,1) infinite}
@supports ((-webkit-mask-image:url(/gkhq-mark.png)) or (mask-image:url(/gkhq-mark.png))){#boot-splash .bs-fill{display:block}}
#boot-splash .bs-meta{display:flex;flex-direction:column;align-items:center;gap:26px}
#boot-splash .bs-bar{position:relative;width:240px;height:2px;border-radius:1px;background:rgba(240,238,233,.10);overflow:hidden}
#boot-splash .bs-bar::after{content:"";position:absolute;top:0;left:0;width:72px;height:2px;background:linear-gradient(to right,rgba(18,196,0,0) 0%,#12C400 50%,rgba(18,196,0,0) 100%);animation:bs-sweep 1.4s cubic-bezier(.45,0,.2,1) infinite}
#boot-splash .bs-label{font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:500;font-size:12px;line-height:1;letter-spacing:.32em;text-indent:.32em;text-transform:uppercase;color:#8A8A85}
@keyframes bs-rise{0%{background-position:0 0%;opacity:1}58%{background-position:0 100%;opacity:1}82%{background-position:0 100%;opacity:1}100%{background-position:0 100%;opacity:0}}
@keyframes bs-glow{0%{opacity:.3}58%{opacity:1}82%{opacity:1}100%{opacity:.3}}
@keyframes bs-sweep{0%{transform:translateX(-72px)}100%{transform:translateX(240px)}}
@media (prefers-reduced-motion:reduce){#boot-splash .bs-glow,#boot-splash .bs-fill,#boot-splash .bs-bar::after{animation:none}#boot-splash .bs-fill{background-position:0 100%}#boot-splash .bs-glow{opacity:.8}}
`;

/**
 * Shortest time the splash stays up: one full `bs-rise` loop (2.2s), so the
 * mark always fills and fades once instead of being cut off mid-rise.
 */
export const BOOT_SPLASH_MIN_MS = 2200;

/**
 * Takes the splash down once the page has loaded and the minimum time has
 * passed.
 *
 * It runs as a plain inline script rather than an effect because the splash has
 * to clear even if hydration is slow or fails; the 4s timeout is the backstop.
 */
export const bootSplashHideScript = `(()=>{const el=document.getElementById('boot-splash');if(!el)return;const t0=Date.now();const hide=()=>{el.setAttribute('data-hide','1');setTimeout(()=>el.remove(),400)};const later=()=>setTimeout(hide,Math.max(150,${BOOT_SPLASH_MIN_MS}-(Date.now()-t0)));if(document.readyState==='complete'){later()}else{window.addEventListener('load',later,{once:true})}setTimeout(hide,4000)})();`;

/**
 * The first-paint splash: the GKHQ mark filling with GK Green, a sweeping
 * progress track and the product name.
 *
 * It is inert markup on purpose. It ships in the SSR'd body so it is painted
 * before React hydrates, `bootSplashHideScript` removes it once the page has
 * loaded, and `aria-hidden` keeps it out of the accessibility tree because it
 * carries no information the app itself does not repeat.
 *
 * The mark is `/gkhq-mark.png` cut out with `mask-image` rather than redrawn,
 * so the brand file stays the single source of the shape. Browsers without
 * mask support fall back to the dim base image alone.
 */
export function BootSplash() {
  return (
    <div id="boot-splash" aria-hidden="true">
      <div className="bs-wrap">
        <div className="bs-mark">
          <span className="bs-glow" />
          <img className="bs-base" src="/gkhq-mark.png" alt="" draggable={false} />
          <span className="bs-fill" />
        </div>
        <div className="bs-meta">
          <div className="bs-bar" />
          <div className="bs-label">Mentor Hub</div>
        </div>
      </div>
    </div>
  );
}
