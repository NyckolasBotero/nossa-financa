import json, sys, threading, http.server, socketserver, functools, datetime, uuid
from playwright.sync_api import sync_playwright
ROOT='/home/claude/nossa-financa'
H=functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',8765), type('H',(Q,),{'__init__':lambda self,*a,**k: Q.__init__(self,*a,directory=ROOT,**k)}))
threading.Thread(target=srv.serve_forever,daemon=True).start()

today=datetime.date(2026,11,19)
def iso(d): return d.isoformat()
me={'id':'u1','name':'Teste','username':'t@x.com','email':'t@x.com','role':'admin','active':True}
wife={'id':'u2','name':'Esposa','username':'e@x.com','email':'e@x.com','role':'member','active':True}
cats=[('c1','Salário','income','💼','#12a572','salary','', ),('c2','Moradia','expense','🏠','#4a90e2','housing','bills'),('c3','Mercado','expense','🛒','#16a39a','food','bills'),('c4','Fast food','expense','🍔','#f0566a','fastfood','others'),('c5','Veículo','expense','🚗','#3d6ea8','vehicle','bills'),('c6','Lazer','expense','🎉','#fd9644','leisure','others')]
categories=[dict(id=i,name=n,type=t,icon=ic,color=c,tag=tg,bucket=b,keywords='',archived=False,createdAt='',updatedAt='') for i,n,t,ic,c,tg,b in cats]
tx=[]
def T(d,ty,amt,desc,cat='',acc='a1',card='',method='Pix',fx=''):
    tx.append(dict(id=str(uuid.uuid4())[:8],clientId='',date=iso(d),type=ty,amount=amt,description=desc,merchant='',categoryId=cat,accountId=acc if not card else '',cardId=card,ownerId='u1',scope='shared',origin='manual',fixedBillId=fx,goalId='',refMonth='',notes='',method=method,archived=False,createdAt=iso(d)+'T10:00:00Z',updatedAt=''))
for m in (8,9,10,11):
    T(datetime.date(2026,m,5),'income',5200,'Salário','c1',fx='i1')
    T(datetime.date(2026,m,10),'expense',1500,'Aluguel','c2',fx='b1')
    for k in range(8): T(datetime.date(2026,m,min(28,3+k*3)),'expense',60+k*14,'Mercado' if k%2 else 'iFood','c3' if k%2 else 'c4',method='Débito')
T(datetime.date(2026,11,12),'saving',1800,'Guardado','','a1')
tx[-1]['goalId']='g1'
state=dict(serverTime='2026-11-19T12:00:00Z',me=me,users=[me,wife],
 accounts=[dict(id='a1',name='Conta corrente',kind='checking',ownerId='u1',institution='',initialBalance=3000,archived=False)],
 cards=[dict(id='f1',name='Alimentação',kind='food',ownerId='u1',limit=0,closingDay=None,dueDay=None,initialBalance=400,archived=False)],
 categories=categories,
 fixedBills=[dict(id='b1',name='Aluguel',kind='expense',amount=1500,dueDay=10,categoryId='c2',accountId='a1',cardId='',ownerId='u1',scope='shared',startMonth='2026-08',endMonth='',method='Pix',archived=False,createdAt='2026-08-01T00:00:00Z'),
  dict(id='b2',name='Internet',kind='expense',amount=120,dueDay=25,categoryId='c2',accountId='a1',cardId='',ownerId='u1',scope='shared',startMonth='2026-08',endMonth='',method='Débito',archived=False,createdAt='2026-08-01T00:00:00Z'),
  dict(id='i1',name='Salário',kind='income',amount=5200,dueDay=5,categoryId='c1',accountId='a1',cardId='',ownerId='u1',scope='individual',startMonth='2026-08',endMonth='',method='Pix',archived=False,createdAt='2026-08-01T00:00:00Z'),
  dict(id='i2',name='Aluguel recebido',kind='income',amount=800,dueDay=25,categoryId='c1',accountId='a1',cardId='',ownerId='u1',scope='individual',startMonth='2026-11',endMonth='',method='Pix',archived=False,createdAt='2026-11-01T00:00:00Z')],
 goals=[dict(id='g1',name='Reserva de emergência',target=6000,deadline='',ownerId='u1',scope='shared',archived=False),dict(id='g2',name='Viagem',target=3000,deadline='2027-06-30',ownerId='u1',scope='shared',archived=False)],
 settings=dict(paymentMethods=['Pix','Débito','Crédito']),transactions=tx,inboxCounts=dict(pending=2))
import json as _j
# contas variáveis
state['fixedBills']+= [dict(id='v1',name='Água',kind='expense',billType='variable',amount=90,dueDay=12,categoryId='c2',accountId='a1',cardId='',ownerId='u1',scope='shared',startMonth='2026-06',endMonth='',method='Pix',archived=False,createdAt='2026-06-01T00:00:00Z'),
 dict(id='v2',name='Luz',kind='expense',billType='variable',amount=210,dueDay=15,categoryId='c2',accountId='a1',cardId='',ownerId='u1',scope='shared',startMonth='2026-06',endMonth='',method='Pix',archived=False,createdAt='2026-06-01T00:00:00Z')]
for i,(m,a,l) in enumerate([(6,82,190),(7,95,230),(8,70,260),(9,110,205),(10,88,240)]):
    T(datetime.date(2026,m,12),'expense',a,'Água','c2',fx='v1'); T(datetime.date(2026,m,15),'expense',l,'Luz','c2',fx='v2')
state['goals'].append(dict(id='gv',name='Cofre de segurança',target=30000,deadline='',ownerId='u1',scope='shared',kind='vault',archived=False))
T(datetime.date(2026,10,20),'saving',7500,'Guardado: cofre de segurança','','a1'); tx[-1]['goalId']='gv'
state['payslips']=[dict(id='p1',ownerId='u1',payDate='2026-10-05',refMonth='2026-09',net=2114.62,gross=3580.56,discounts=1465.94,items=_j.dumps([dict(label='SALARIO',kind='earning',value=3148.06,ref='30,00'),dict(label='PREMIO (PRODUTIVIDADE)',kind='earning',value=432.5,ref=''),dict(label='DESC DE VALES OU ADIANTAMENTO',kind='discount',value=115.17,ref=''),dict(label='INSS',kind='discount',value=266.35,ref='12,00'),dict(label='ADIANTAMENTO DE SALÁRIO',kind='discount',value=944.42,ref=''),dict(label='MENSALIDADE SINDICAL',kind='discount',value=35,ref=''),dict(label='VALE REFEIÇÃO',kind='discount',value=105,ref='0,20')]),notes='',accountId='a1',transactionId='',archived=False),
 dict(id='p2',ownerId='u1',payDate='2026-09-05',refMonth='2026-08',net=2290.1,gross=3580.56,discounts=1290.46,items='[]',notes='',accountId='a1',transactionId='',archived=False)]
state['pantry']=[dict(id='i1',name='Arroz 5 kg',group='Grãos e massas',packs=2,perPack=6,units=1,unit='kg',expiry='2027-03-01',perPersonDay=0.1,notes='',archived=False),
 dict(id='i2',name='Leite integral',group='Bebidas',packs=1,perPack=12,units=3,unit='L',expiry='2026-12-05',perPersonDay=0.5,notes='',archived=False),
 dict(id='i3',name='Milho em lata',group='Enlatados e conservas',packs=0,perPack=24,units=5,unit='lata',expiry='2026-11-10',perPersonDay=0.2,notes='',archived=False)]
state['settings'].update(pantry=dict(people=4),vault=dict(monthlyCost=None,months=6))
log=[]
def handler(route):
    body=json.loads(route.request.post_data or '{}'); a=body.get('action'); log.append(a)
    if a=='auth.login': d=dict(token='tok',user=me)
    elif a=='bootstrap': d=state
    elif a=='sync': d=dict(serverTime='2026-11-19T12:01:00Z',users=[me,wife],settings=state['settings'],inboxCounts=dict(pending=2),transactions=[],accounts=[],cards=[],categories=[],fixedBills=[],goals=[],payslips=[],pantry=[])
    elif a=='news.get': d=dict(updatedAt='x',groups=[dict(id='brasil',label='Brasil: juros, inflação e câmbio',items=[dict(title='Copom mantém Selic e sinaliza cautela com a inflação de alimentos',link='https://exemplo.com/1',source='Jornal X',date='Thu, 19 Nov 2026 10:00:00 GMT'),dict(title='Dólar fecha em queda e bolsa sobe com cenário externo',link='https://exemplo.com/2',source='Portal Y',date='Thu, 19 Nov 2026 08:00:00 GMT')]),dict(id='mundo',label='Mundo: alertas e economia global',items=[dict(title='Petróleo oscila após tensão no Oriente Médio',link='https://exemplo.com/3',source='Agência Z',date='Thu, 19 Nov 2026 07:00:00 GMT')])])
    elif a=='tx.create': d={**body['payload'],'id':'new1','archived':False,'createdAt':'2026-11-19T12:00:00Z'}
    else: d={}
    import time
    if a in('auth.login','tx.create'): time.sleep(1.2)
    route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps(dict(ok=True,data=d)))
out=sys.argv[1] if len(sys.argv)>1 else '/tmp/vt2'
import os; os.makedirs(out,exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    def page(w,h,scheme='light'):
        c=b.new_context(viewport=dict(width=w,height=h),color_scheme=scheme); pg=c.new_page()
        pg.route('**/script.google.com/**',handler); pg.route('**/fonts.g*/**',lambda r:r.abort())
        errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and 'fonts' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.errs=errs; return pg
    def login(pg):
        pg.goto('http://127.0.0.1:8765/index.html'); pg.wait_for_timeout(700)
        pg.fill('#c-email','t@x.com'); pg.fill('#c-password','senha1234'); pg.click('button[type=submit]')
        pg.wait_for_selector('#db-hero .gauge',timeout=9000); pg.wait_for_timeout(2200)
    pg=page(1280,800); login(pg)
    pg.screenshot(path=f'{out}/d1-dash.png',full_page=True)
    pg.wait_for_timeout(300)
    for r in ('fixed','payslips','vault','pantry'):
        pg.goto(f'http://127.0.0.1:8765/index.html#/{r}'); pg.wait_for_timeout(1600); pg.screenshot(path=f'{out}/p-{r}.png',full_page=True)
    pg.click('#ps-new') if False else None
    pg.goto('http://127.0.0.1:8765/index.html#/payslips'); pg.wait_for_timeout(1200); pg.click('#ps-new'); pg.wait_for_timeout(800); pg.screenshot(path=f'{out}/m-payslip.png')
    pg.keyboard.press('Escape'); pg.reload(); pg.wait_for_timeout(1500)
    pg.goto('http://127.0.0.1:8765/index.html#/fixed'); pg.wait_for_timeout(1200); pg.click('#fx-new'); pg.wait_for_timeout(800); pg.screenshot(path=f'{out}/m-bill.png')
    print('ERRS',pg.errs[:8])
    dk=page(1280,800,'dark'); login(dk); dk.screenshot(path=f'{out}/d2-dark.png',full_page=True)
    dk.click('#side'); dk.wait_for_timeout(900); dk.screenshot(path=f'{out}/d3-side-open.png')
    print('ERRS dark',dk.errs[:8])
    m=page(390,800,'light'); login(m); m.screenshot(path=f'{out}/m1.png',full_page=True); print('ERRS m',m.errs[:8])
