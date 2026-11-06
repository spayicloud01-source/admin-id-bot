/* Admin ID owner-only Web Push. No request caching or access-token storage. */
self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{}
  // Notification text deliberately contains no name, balance, queue or slip URL.
  const title="Admin ID — มีสลิปใหม่";
  event.waitUntil(self.registration.showNotification(title,{
    body:"ลูกค้าส่งหลักฐานชำระแล้ว กรุณาเปิดคิวตรวจสอบ",
    icon:"/admin-icon.svg",
    badge:"/admin-icon.svg",
    tag:typeof data.tag==="string"?data.tag.slice(0,90):"admin-id-new-slip",
    renotify:true,
    data:{url:"/?tab=reviewTools"}
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const destination=new URL("/?tab=reviewTools",self.location.origin).href;
  event.waitUntil((async()=>{
    const clientsList=await clients.matchAll({type:"window",includeUncontrolled:true});
    const existing=clientsList.find(x=>new URL(x.url).origin===self.location.origin);
    if(existing){
      await existing.focus();
      if(typeof existing.navigate==="function")await existing.navigate(destination);
      return;
    }
    await clients.openWindow(destination);
  })());
});
