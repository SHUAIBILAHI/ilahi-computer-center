const express=require('express'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const DIR=path.join(__dirname,'data'),F=path.join(DIR,'db.json'),DAY=864e5;
const hash=(p,s=crypto.randomBytes(8).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
const ok=(p,h)=>hash(p,h.split(':')[0])===h, uid=()=>crypto.randomBytes(5).toString('hex');
let db={cats:[],services:[],notices:[],downloads:[],users:[],requests:[],chat:[],act:[],sessions:{},admin:hash(process.env.ADMIN_PASS||'admin123')};
if(fs.existsSync(F))db=JSON.parse(fs.readFileSync(F));else{
 const c={id:uid(),name:'Aadhaar & Identity'},c2={id:uid(),name:'Certificates'},c3={id:uid(),name:'Online Forms'};
 db.cats=[c,c2,c3];db.services=[
 {id:uid(),cat:c.id,name:'Aadhaar Update',desc:'Naam, pata ya mobile number update.',docs:['Purana Aadhaar','Address proof','Mobile number']},
 {id:uid(),cat:c.id,name:'PAN Card',desc:'Naya PAN ya correction.',docs:['Aadhaar card','Photo','Signature']},
 {id:uid(),cat:c2.id,name:'Income Certificate',desc:'UP e-District se aay praman patra.',docs:['Aadhaar card','Ration card','Self declaration']},
 {id:uid(),cat:c3.id,name:'Voter ID Form',desc:'Naya voter ID ya correction.',docs:['Aadhaar card','Photo','Age proof']}];
 db.notices=[{id:uid(),type:'imp',title:'Center ka samay subah 9 se shaam 7 baje tak',date:Date.now()},{id:uid(),type:'job',title:'UP Police Constable Bharti – form bharna shuru',date:Date.now()}];save();}
function save(){fs.mkdirSync(DIR,{recursive:true});fs.writeFileSync(F,JSON.stringify(db,null,1));}
function sweep(){let ch=0;db.users.forEach(u=>{if(u.active&&Date.now()-u.last>30*DAY){u.active=false;ch=1}});if(ch)save();}
const app=express();app.use(express.json());app.use(express.static(path.join(__dirname,'public')));
const A=express.Router(),auth=r=>(q,s,n)=>{const t=db.sessions[q.headers['x-token']];if(!t||(r&&t.role!==r))return s.status(401).json({error:'Pehle login karein'});q.who=t;n()};
const pub=u=>({id:u.id,name:u.name,mobile:u.mobile,active:u.active,last:u.last,joined:u.joined});
const login=(s,role,id)=>{const t=crypto.randomBytes(16).toString('hex');db.sessions[t]={role,id};save();s.json({token:t,role,id})};
A.get('/public',(q,s)=>{s.json({cats:db.cats,services:db.services,notices:db.notices})});
A.post('/signup',(q,s)=>{const{name,mobile,password}=q.body;if(!name||!/^\d{10}$/.test(mobile||'')||!password||password.length<4)return s.status(400).json({error:'Naam, 10 ank ka mobile aur kam se kam 4 akshar ka password dalein'});
 if(db.users.find(u=>u.mobile===mobile))return s.status(400).json({error:'Ye mobile pehle se registered hai'});
 db.users.push({id:uid(),name,mobile,pass:hash(password),active:true,joined:Date.now(),last:Date.now()});save();s.json({ok:1})});
A.post('/login',(q,s)=>{sweep();const{role,id,password}=q.body;
 if(role==='admin'){if(id==='admin'&&ok(password||'',db.admin))return login(s,'admin','admin');return s.status(400).json({error:'Admin ID ya password galat hai'})}
 const u=db.users.find(x=>x.mobile===id);if(!u||!ok(password||'',u.pass))return s.status(400).json({error:'Mobile ya password galat hai'});
 if(!u.active)return s.status(403).json({deactivated:1,mobile:u.mobile,error:'Aap deactive ho gaye hain. Active hone ke liye neeche click karein.'});
 u.last=Date.now();login(s,'user',u.id)});
A.post('/activation',(q,s)=>{const u=db.users.find(x=>x.mobile===q.body.mobile);if(!u)return s.status(404).json({error:'User nahi mila'});
 if(!db.act.includes(u.id))db.act.push(u.id);save();s.json({ok:1})});
A.get('/me',auth(),(q,s)=>{const u=db.users.find(x=>x.id===q.who.id);if(u){u.last=Date.now();save()}s.json({role:q.who.role,user:u&&pub(u)})});
const crud=(k,fields,role='admin')=>{A.post('/'+k,auth(role),(q,s)=>{const o={id:uid()};fields.forEach(f=>o[f]=q.body[f]);if(k==='notices')o.date=Date.now();db[k].push(o);save();s.json(o)});
 A.delete('/'+k+'/:id',auth(role),(q,s)=>{db[k]=db[k].filter(x=>x.id!==q.params.id);if(k==='cats')db.services=db.services.filter(x=>x.cat!==q.params.id);save();s.json({ok:1})})};
crud('cats',['name']);crud('services',['cat','name','desc','docs']);crud('notices',['type','title']);crud('downloads',['title','url']);
A.put('/services/:id',auth('admin'),(q,s)=>{const o=db.services.find(x=>x.id===q.params.id);if(o)Object.assign(o,{cat:q.body.cat,name:q.body.name,desc:q.body.desc,docs:q.body.docs});save();s.json(o)});
A.get('/downloads',auth(),(q,s)=>s.json(db.downloads));
A.post('/requests',auth('user'),(q,s)=>{const sv=db.services.find(x=>x.id===q.body.service);if(!sv)return s.status(400).json({error:'Service nahi mili'});
 const r={id:uid(),user:q.who.id,service:sv.id,sname:sv.name,urgent:!!q.body.urgent,note:q.body.note||'',status:'Pending',date:Date.now()};db.requests.push(r);save();s.json(r)});
A.get('/requests',auth(),(q,s)=>{const L=q.who.role==='admin'?db.requests.map(r=>({...r,uname:(db.users.find(u=>u.id===r.user)||{}).name,umobile:(db.users.find(u=>u.id===r.user)||{}).mobile})):db.requests.filter(r=>r.user===q.who.id);s.json(L.sort((a,b)=>b.date-a.date))});
A.put('/requests/:id',auth('admin'),(q,s)=>{const r=db.requests.find(x=>x.id===q.params.id);if(r)r.status=q.body.status;save();s.json(r)});
A.get('/customers',auth('admin'),(q,s)=>{sweep();s.json({users:db.users.map(pub),act:db.act})});
A.post('/customers/:id/activate',auth('admin'),(q,s)=>{const u=db.users.find(x=>x.id===q.params.id);if(u){u.active=true;u.last=Date.now()}db.act=db.act.filter(x=>x!==q.params.id);save();s.json({ok:1})});
A.post('/customers/:id/deactivate',auth('admin'),(q,s)=>{const u=db.users.find(x=>x.id===q.params.id);if(u)u.active=false;save();s.json({ok:1})});
A.get('/chat',auth(),(q,s)=>{const u=q.who.role==='admin'?q.query.user:q.who.id;s.json(db.chat.filter(m=>m.user===u))});
A.get('/chatusers',auth('admin'),(q,s)=>s.json(db.users.map(pub)));
A.post('/chat',auth(),(q,s)=>{const u=q.who.role==='admin'?q.body.user:q.who.id;if(!q.body.text||!u)return s.status(400).json({});db.chat.push({id:uid(),user:u,from:q.who.role,text:String(q.body.text).slice(0,500),date:Date.now()});save();s.json({ok:1})});
app.use('/api',A);app.listen(process.env.PORT||3000,()=>console.log('Ilahi Computer Center: http://localhost:3000'));
