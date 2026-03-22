/**
 * Gratis API Tabanlı Scraper (Sitemap + Retter.io getProductDetail API)
 * Barkod (EAN/UPC) dahil tüm ürün verilerini çeker.
 * Çalıştır: node gratis-sitemap-scraper.js
 */
const https=require('https'),fs=require('fs'),path=require('path');
const OUTPUT=path.join(__dirname,'gratis-products.json');
const CHECKPOINT=path.join(__dirname,'gratis-api-checkpoint.json');
const SITEMAP_URL='https://www.gratis.com/sitemap/Product-tr-TRY.xml';
const API_BASE='https://api.gratis.retter.io/1oakekr4e/CALL/Product/getProductDetail/';
const CONCURRENCY=8,DELAY_MS=150;
const MAKEUP_CATS={'maskara':'maskara','rimel':'maskara','fondoten':'fondoten','ruj':'ruj','likit-ruj':'ruj','mat-ruj':'ruj','eyeliner':'eyeliner','far':'far','goz-fari':'far','far-paleti':'far-paleti','allik':'allik','pudra':'pudra','kapatici':'kapatici','dudak-parlatici':'dudak-parlatici','dudak-kalemi':'dudak-kalemi','aydinlatici':'aydinlatici','bronzer':'bronzer','primer':'primer','kontur':'kontur','goz-kalemi':'goz-kalemi'};
const CAT_LABELS={'maskara':'Maskara','fondoten':'Fondöten','ruj':'Ruj','eyeliner':'Eyeliner','far':'Göz Farı','far-paleti':'Far Paleti','allik':'Allık','pudra':'Pudra','kapatici':'Kapatıcı','dudak-parlatici':'Dudak Parlatıcı','dudak-kalemi':'Dudak Kalemi','aydinlatici':'Aydınlatıcı','bronzer':'Bronzer','primer':'Primer','kontur':'Kontür','goz-kalemi':'Göz Kalemi'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function fetchJSON(url){return new Promise(resolve=>{https.get(url,{headers:{'User-Agent':'Mozilla/5.0 Chrome/120','Origin':'https://www.gratis.com','Referer':'https://www.gratis.com/'},timeout:12000},(res)=>{const c=[];res.on('data',d=>c.push(d));res.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(c).toString()))}catch{resolve(null)}});}).on('error',()=>resolve(null)).setTimeout(12000,function(){this.destroy();resolve(null)})});}
function fetchText(url){return new Promise(resolve=>{https.get(url,{headers:{'User-Agent':'Mozilla/5.0'},timeout:15000},(res)=>{const c=[];res.on('data',d=>c.push(d));res.on('end',()=>resolve(Buffer.concat(c).toString()));}).on('error',()=>resolve('')).setTimeout(15000,function(){this.destroy();resolve('')})});}
function parseProduct(data,id,category,url){
  if(!data||!data.product)return null;
  const p=data.product;
  if(p.stockStatus==='OUT_OF_STOCK')return null;
  const prices=p.prices||{};
  // "Gratis Kart ile" indirimi sadece kart sahiplerine özel — karşılaştırma için normalPrice kullan.
  // Gerçek kampanya indirimi (herkese açık) ise discountedPrice kullan.
  const isCardOnly = (prices.discountedText||'').toLowerCase().includes('kart');
  let price;
  if (isCardOnly) {
    // Kart fiyatı değil, normal (kartsız) fiyatı kullan
    price = prices.normalPrice ? prices.normalPrice/100 : 0;
  } else {
    // Herkese açık kampanya indirimi varsa onu, yoksa normal fiyatı kullan
    price = prices.discountedPrice ? prices.discountedPrice/100 : prices.normalPrice ? prices.normalPrice/100 : 0;
  }
  if(price<=0)return null;
  const imageUrl=(p.imageUrls&&p.imageUrls[0])?p.imageUrls[0].fileUrl:'';
  let name='',brand='',barcode='';
  for(const a of(p.attributes||[])){
    if(a.key==='displayName'&&a.value)name=a.value.trim();
    if(a.key==='brand'&&a.value)brand=a.value.trim();
    if(a.key==='brandName'&&a.value&&!brand)brand=a.value.trim();
    if(a.key==='eanUpc'&&a.value)barcode=String(a.value).trim();
  }
  if(!name)return null;
  return{id,name,brand,category,categoryLabel:CAT_LABELS[category]||category,price,imageUrl,productUrl:url,barcode,rating:parseFloat(data.reviewAverage||0)||0,reviews:parseInt(data.reviewCount||0)||0,source:'gratis'};
}
async function main(){
  console.log('Sitemap indiriliyor...');
  const xml=await fetchText(SITEMAP_URL);
  const all=[...xml.matchAll(/<loc>(https:\/\/www\.gratis\.com\/([^<]+))<\/loc>/g)].map(m=>({url:m[1],seg:m[2].split('/')[0].toLowerCase()})).filter(({seg})=>MAKEUP_CATS[seg]).map(({url,seg})=>({url,category:MAKEUP_CATS[seg],id:url.match(/-p-(\d+)/)?.[1]})).filter(p=>p.id);
  console.log('Makyaj URL sayısı:',all.length);
  let ckpt={};
  if(fs.existsSync(CHECKPOINT))ckpt=JSON.parse(fs.readFileSync(CHECKPOINT,'utf8'));
  const todo=all.filter(p=>!(p.id in ckpt));
  console.log('İşlenecek:',todo.length,'\n');
  let done=0,found=0;
  for(let i=0;i<todo.length;i+=CONCURRENCY){
    const batch=todo.slice(i,i+CONCURRENCY);
    const results=await Promise.all(batch.map(async({url,category,id})=>{
      const data=await fetchJSON(API_BASE+id+'?__culture=tr_TR&__platform=WEB');
      return{id,product:parseProduct(data,id,category,url)};
    }));
    results.forEach(({id,product})=>{ckpt[id]=product||null;if(product)found++;});
    done+=batch.length;
    if(done%100===0||i+CONCURRENCY>=todo.length){
      fs.writeFileSync(CHECKPOINT,JSON.stringify(ckpt));
      process.stdout.write(`\r  ${Object.keys(ckpt).length}/${all.length} → bulundu: ${found}`);
    }
    await sleep(DELAY_MS);
  }
  const products=Object.values(ckpt).filter(Boolean);
  fs.writeFileSync(OUTPUT,JSON.stringify(products,null,2));
  console.log('\nTamamlandı:',products.length,'ürün | barkodlu:',products.filter(p=>p.barcode).length);
  const cats={};products.forEach(p=>cats[p.category]=(cats[p.category]||0)+1);
  Object.entries(cats).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(' ',k+':',v));
}
main().catch(console.error);
