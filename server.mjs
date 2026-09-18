import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('./dist/',import.meta.url));
const port=Number(process.env.PORT||5173);
const host=process.env.HOST||'127.0.0.1';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.md':'text/plain; charset=utf-8','.webmanifest':'application/manifest+json'};
createServer(async(request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return;}
  try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const file=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
    if(!file.startsWith(resolve(root)+sep)){response.writeHead(403).end();return;}
    const content=await readFile(file);
    const headers={'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Length':content.length};
    const range=request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if(range&&(range[1]||range[2])){
      const start=range[1]?Number(range[1]):Math.max(0,content.length-Number(range[2]));
      const end=range[1]&&range[2]?Math.min(Number(range[2]),content.length-1):content.length-1;
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=content.length){response.writeHead(416,{'Content-Range':`bytes */${content.length}`}).end();return;}
      response.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${content.length}`,'Content-Length':end-start+1});response.end(request.method==='HEAD'?undefined:content.subarray(start,end+1));return;
    }
    response.writeHead(200,headers);
    response.end(request.method==='HEAD'?undefined:content);
  }catch{response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Страница не найдена');}
}).listen(port,host,()=>console.log(`Full Body: http://${host}:${port}`));
