/**
 * Style for the splash below.
 *
 * It is a string the root shell inlines into `<head>` rather than a rule in
 * `styles.css`, because the splash has to paint before any stylesheet arrives.
 */
export const bootSplashCss = `
.bs-screen{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:#0D0D0D;transition:opacity .35s ease-out;opacity:1;pointer-events:auto}
.bs-screen[data-hide="1"]{opacity:0;pointer-events:none}
.bs-screen .bs-wrap{display:flex;flex-direction:column;align-items:center;gap:40px}
.bs-screen .bs-mark{position:relative;width:134px;height:154px}
.bs-screen .bs-glow{position:absolute;left:50%;top:50%;width:380px;height:380px;margin:-190px 0 0 -190px;border-radius:50%;background:radial-gradient(circle,rgba(18,196,0,.22) 0%,rgba(18,196,0,.06) 38%,rgba(18,196,0,0) 62%);pointer-events:none;animation:bs-glow 2.2s ease-in-out infinite}
.bs-screen .bs-base{position:absolute;left:0;top:0;width:134px;height:154px;object-fit:contain;opacity:.16}
.bs-screen .bs-fill{display:none;position:absolute;left:0;top:0;width:134px;height:154px;background:linear-gradient(to bottom,rgba(18,196,0,0) 0%,rgba(18,196,0,0) 50%,#12C400 58%,#12C400 100%);background-size:100% 240%;background-repeat:no-repeat;-webkit-mask-image:url(/gkhq-mark.png);mask-image:url(/gkhq-mark.png);-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;animation:bs-rise 2.2s cubic-bezier(.45,0,.2,1) infinite}
@supports ((-webkit-mask-image:url(/gkhq-mark.png)) or (mask-image:url(/gkhq-mark.png))){.bs-screen .bs-fill{display:block}}
.bs-screen .bs-meta{display:flex;flex-direction:column;align-items:center;gap:26px}
.bs-screen .bs-bar{position:relative;width:240px;height:2px;border-radius:1px;background:rgba(240,238,233,.10);overflow:hidden}
.bs-screen .bs-bar::after{content:"";position:absolute;top:0;left:0;width:72px;height:2px;background:linear-gradient(to right,rgba(18,196,0,0) 0%,#12C400 50%,rgba(18,196,0,0) 100%);animation:bs-sweep 1.4s cubic-bezier(.45,0,.2,1) infinite}
.bs-screen .bs-label{font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:500;font-size:12px;line-height:1;letter-spacing:.32em;text-indent:.32em;text-transform:uppercase;color:#8A8A85}
html[data-no-splash] #boot-splash{display:none}
.bs-screen.bs-enter{animation:bs-in .25s ease-out}
@keyframes bs-in{from{opacity:0}to{opacity:1}}
@keyframes bs-rise{0%{background-position:0 0%;opacity:1}58%{background-position:0 100%;opacity:1}82%{background-position:0 100%;opacity:1}100%{background-position:0 100%;opacity:0}}
@keyframes bs-glow{0%{opacity:.3}58%{opacity:1}82%{opacity:1}100%{opacity:.3}}
@keyframes bs-sweep{0%{transform:translateX(-72px)}100%{transform:translateX(240px)}}
@media (prefers-reduced-motion:reduce){.bs-screen .bs-glow,.bs-screen .bs-fill,.bs-screen .bs-bar::after{animation:none}.bs-screen .bs-fill{background-position:0 100%}.bs-screen .bs-glow{opacity:.8}}
`;

/**
 * How long the sign-in splash holds before the dashboard shows: one full
 * `bs-rise` loop, so the mark fills and fades exactly once.
 */
export const SIGN_IN_SPLASH_MS = 2200;

/**
 * Skips the page-load splash for anyone without a saved session, so a signed
 * out visitor lands straight on the sign-in screen.
 *
 * It runs in `<head>`, before the splash markup is parsed, and looks for the
 * `sb-<project>-auth-token` key the Supabase client keeps in localStorage.
 */
export const bootSplashSkipScript = `(()=>{try{if(!Object.keys(localStorage).some(k=>/^sb-.+-auth-token/.test(k)))document.documentElement.setAttribute('data-no-splash','1')}catch(e){document.documentElement.setAttribute('data-no-splash','1')}})();`;

/**
 * Takes the splash down once the page has loaded.
 *
 * It runs as a plain inline script rather than an effect because the splash has
 * to clear even if hydration is slow or fails; the 4s timeout is the backstop.
 */
export const bootSplashHideScript = `(()=>{const el=document.getElementById('boot-splash');if(!el)return;const hide=()=>{el.setAttribute('data-hide','1');setTimeout(()=>el.remove(),400)};if(document.readyState==='complete'){setTimeout(hide,150)}else{window.addEventListener('load',()=>setTimeout(hide,150),{once:true})}setTimeout(hide,4000)})();`;

/** The mark filling with GK Green, the sweeping track and the product name. */
function SplashArt() {
  return (
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
  );
}

/**
 * The first-paint splash, shown on page load to signed-in users only (see
 * `bootSplashSkipScript`).
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
    <div id="boot-splash" className="bs-screen" aria-hidden="true">
      <SplashArt />
    </div>
  );
}

/**
 * The same splash, faded in over the login page for `SIGN_IN_SPLASH_MS` after
 * a successful sign-in, before the dashboard shows.
 */
export function SignInSplash() {
  return (
    <div className="bs-screen bs-enter" role="status" aria-label="Signing you in">
      <SplashArt />
    </div>
  );
}
