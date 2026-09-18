import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('./dist/',import.meta.url));
const port=Number(process.env.PORT||5173);
const host=process.env.HOST||'127.0.0.1';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
createServer(async(request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return;}
  try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const file=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
    if(!file.startsWith(resolve(root)+sep)){response.writeHead(403).end();return;}
    const content=await readFile(file);
    response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    response.end(request.method==='HEAD'?undefined:content);
  }catch{response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Страница не найдена');}
}).listen(port,host,()=>console.log(`Full Body: http://${host}:${port}`));
