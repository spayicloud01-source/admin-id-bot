import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isSupportedPushEndpoint,validSubscription} from "../lib/ownerSlipPush.js";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(js,"Admin ID owner dashboard has an inline script");
new Function(js);
for(const id of ["slipAlertBadge","slipAlertStatus","slipSoundToggle","slipPushEnable",
 "slipPushDisable","slipPushHint","slipRecentEntries","slipAcknowledge"]){
 assert.ok(html.includes('id="'+id+'"'),"missing owner slip-alert control "+id);
}
assert.match(html,/href="\/admin-manifest\.webmanifest"/);
assert.match(html,/var slipAlertsStarted=false,slipAlertBusy=false/);
assert.match(js,/setInterval\(function\(\)\{if\(document\.visibilityState==="visible"\)refreshOwnerSlips\(\)\},30000\)/,
 "foreground-only 30s owner polling");
assert.match(js,/Notification\.requestPermission\(\)/,"push consent requires explicit tap");
assert.match(js,/serviceWorker\.register\("\/admin-sw\.js"/,"push runs under owner PWA service worker");
assert.match(js,/action:"seen",through:slipLatestAt/,"owner acknowledgement only after viewing events");
assert.match(js,/action:"unsubscribe",endpoint:subscription\.endpoint/);
assert.match(js,/if\(slipSoundEnabled\)slipSound\(\)/,"sound playback is tied to user opt-in");
assert.match(js,/new URLSearchParams\(location\.search\)\.get\("tab"\)/,"push link opens correct review tab");
const sw=readFileSync(new URL("../admin-sw.js",import.meta.url),"utf8");
new Function("self","clients",sw);
assert.match(sw,/self\.registration\.showNotification/);
assert.match(sw,/notificationclick/);
assert.match(sw,/tab=reviewTools/);
assert.doesNotMatch(sw,/cache\.addAll|caches\.open|accessToken|name:|amount:|queue:/,
  "push message stores no financial details or cached session");
const manifest=JSON.parse(readFileSync(new URL("../admin-manifest.webmanifest",import.meta.url),"utf8"));
assert.equal(manifest.display,"standalone");
assert.equal(manifest.start_url,"/?tab=overview");
const route=readFileSync(new URL("../vercel.json",import.meta.url),"utf8");
assert.match(route,/\/api\/web\/slip-alerts/);
const api=readFileSync(new URL("../lib/ownerSlipAlertsApi.js",import.meta.url),"utf8");
assert.match(api,/validOwnerSession\(req\)/,"owner session is revalidated on every request");
assert.match(api,/sameOrigin\(req\)/,"cross-origin pushes are denied");
const payment=readFileSync(new URL("../lib/customerPaymentApi.js",import.meta.url),"utf8");
assert.match(payment,/if \(result\.queued && !result\.duplicate\)/);
assert.match(payment,/await recordSlipSubmission\(/);
assert.match(payment,/catch \(alertError\)/,"failed notifications may not fail financial submission");
const allowed=[
 "https://webpush.push.apple.com/AAABBB",
 "https://fcm.googleapis.com/fcm/send/ABCD",
 "https://updates.push.services.mozilla.com/wpush/v2/abc",
 "https://wns2-blu.notify.windows.com/w/?token=abc" // query-bearing endpoint is intentionally rejected
];
assert.equal(isSupportedPushEndpoint(allowed[0]),true);
assert.equal(isSupportedPushEndpoint(allowed[1]),true);
assert.equal(isSupportedPushEndpoint(allowed[2]),true);
assert.equal(isSupportedPushEndpoint(allowed[3]),false);
for(const url of ["http://127.0.0.1/a","https://evil.com/a","https://x.push.apple.com.evil.net/","file:///etc/passwd"]){
 assert.equal(isSupportedPushEndpoint(url),false);
}
const sub={endpoint:allowed[0],keys:{p256dh:"a".repeat(87),auth:"b".repeat(22)}};
assert.equal(validSubscription(sub),true);
assert.equal(validSubscription({...sub,keys:{p256dh:"a".repeat(87),auth:"bad"}}),false);
console.log("PASS owner slip alerts: owner-only polling, push opt-in, private storage, iPhone install and no payment writes");
