import http from 'node:http';
const apps = [{ id:'fixture-application', name:'陈教练 · 合成演示', email:'coach@example.test', contact:'微信 fixture-coach', student_count:12, device:'both', status:'pending', created_at:'2026-10-17T00:00:00Z' }];
http.createServer(async (req,res)=>{
 const url = new URL(req.url,'http://localhost'); const path=url.pathname; let raw=''; for await(const c of req) raw+=c; const body=raw?JSON.parse(raw):{};
 res.setHeader('content-type','application/json');
 const send=(data,status=200)=>{res.writeHead(status);res.end(data===undefined?'':JSON.stringify(data));};
 if(path==='/events') return send(undefined,204);
 if(path==='/coach-applications'&&req.method==='POST') return send({id:'new-fixture',receipt_email_sent:true},201);
 if(path==='/coach-applications/resend') return send(undefined,204);
 if(path==='/auth/email/reset') return body.token?.startsWith('e')?send({error:'AUTH_INVALID_RESET_CODE'},401):send(undefined,204);
 if(path==='/auth/email/login') return send({user:{id:'fixture-coach',role:body.email.startsWith('admin')?'admin':'coach',email:body.email}, accessToken:'synthetic-access', refreshToken:'synthetic-refresh'});
 if(path==='/me') return send({user:{id:'fixture-coach',role:'coach',email:'coach@example.test'}});
 if(path==='/coach/invite-codes')return send({invite_codes:[{id:'fixture-code',code:'ABCD234567',type:'personal_permanent',revoked_at:null}]});
 if(path.startsWith('/public/invites/'))return send({valid:!path.endsWith('ZZZZ234567'),coach_display_name:path.endsWith('ZZZZ234567')?null:'陈教练'});
 if(path==='/admin/coach-applications')return send({applications:apps});
 if(path.startsWith('/admin/coach-applications/')) {apps[0].status=path.endsWith('reject')?'rejected':'approved';return send({welcome_email_sent:true,result_email_sent:true});}
 if(path==='/admin/overview')return send({stats:{coaches:1,coachedStudents:0,selfTrainStudents:0,activeBonds:0,publishedPlans:0},recentUsers:[],recentPlans:[]});
 return send({error:'FIXTURE_ROUTE_NOT_FOUND'},404);
}).listen(3063,'127.0.0.1',()=>console.log('Synthetic spec093 fixture API on 3063'));
