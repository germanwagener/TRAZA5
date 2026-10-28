import {DatabaseSync} from 'node:sqlite';
import {provisionJuni} from './admin-access.mjs';
import {configureProductionWater} from './configure-betel-water.mjs';
import {mergeProductionCheese} from './merge-betel-cheese.mjs';
import {existsSync} from 'node:fs';
if(process.env.RAILWAY_SERVICE_ID==='bf632963-3316-403a-8590-b4b73d4dba9c'){
 if(process.env.RAILWAY_ENVIRONMENT_ID!=='45af37fc-6b19-4c60-95eb-22f91a9eb0a4'||process.env.RAILWAY_VOLUME_MOUNT_PATH!=='/data'||(process.env.DB_PATH&&process.env.DB_PATH!=='/data/gestion.sqlite')||!existsSync('/data/gestion.sqlite'))throw Error('Entorno incompatible.');
 const db=new DatabaseSync('/data/gestion.sqlite');
 try{db.exec('PRAGMA busy_timeout=15000');console.log('JUNI_ACCESS_VERIFIED '+JSON.stringify(provisionJuni(db)));console.log('BETEL_WATER_VERIFIED '+JSON.stringify(configureProductionWater(db)));const merged=mergeProductionCheese(db);console.log('BETEL_CHEESE_VERIFIED '+JSON.stringify({...merged,references:merged.references?.length}));}finally{db.close();}
}
await import('./online.mjs');
