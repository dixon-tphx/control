import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
 const { migrateData } = await server.ssrLoadModule('/src/App.jsx');
 const { buildReportModel } = await server.ssrLoadModule('/src/modules/ExecutiveReports.jsx');
 const { matchDemoAccount } = await server.ssrLoadModule('/src/auth.jsx');
 const old={schemaVersion:1,createdAt:'2025-01-01',orders:[{id:'REAL-OLD',title:'Conservar',reports:[]}],rooms:[{id:'H001',number:'A-01',draft:true,checks:[{id:'old',status:'ok'}]}],roomHistory:[{id:'HISTORY-2025',date:'2025-01-01'}],budgetEntries:[{id:'ACTUAL',amount:77}],energyRecords:[]};
 const migrated=migrateData(old);
 assert.equal(migrated.schemaVersion,2);
 for (const field of ['orders','rooms','roomHistory','budgetEntries','energyRecords']) assert.deepEqual(migrated[field],old[field]);
 assert.equal(old.schemaVersion,1);
 for(const field of ['protocols','protocolRuns','dailyReadings','gasDeliveries','wasteReadings','purchaseOrders','reportSnapshots']) assert(Array.isArray(migrated[field]),field);
 assert.equal(migrated.protocols.length,13);
 assert.equal(migrated.protocolSettings.waterReserveAlertPercent,null);
 assert.equal((await matchDemoAccount('admin@sigma.local','SigmaAdmin#2026')).role,'admin');
 assert.equal((await matchDemoAccount('USUARIO@SIGMA.LOCAL','SigmaUsuario#2026')).role,'requester');
 assert.equal((await matchDemoAccount('tecnico@sigma.local','SigmaTecnico#2026')).memberId,'carlos');
 assert.equal(await matchDemoAccount('admin@sigma.local','incorrecta'),null);
 assert.equal(await matchDemoAccount('otra@sigma.local','SigmaAdmin#2026'),null);
 const image={id:'PHOTO',url:'data:image/png;base64,AAA=',name:'Evidencia'};
 const model=buildReportModel({orders:[{id:'OLD',createdAt:'2025-01-01',title:'Bomba',area:'Electromecánica',findings:[{at:'2026-10-20',photos:[image],description:'Hallazgo nuevo'}]}],preventiveRuns:[{id:'PM',date:'2026-10-20',area:'Electromecánica',equipment:'Bomba',photos:[image],checks:[]}]},'2026-10-20','2026-10-26');
 assert.equal(model.photos.length,2); assert.equal(model.findings.length,1); assert.equal(model.relevant[0].id,'OLD');
 console.log('PASS migration preserves existing data, initializes new modules and validates all demo roles');
} finally { await server.close(); }
