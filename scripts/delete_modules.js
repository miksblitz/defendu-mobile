#!/usr/bin/env node
/**
 * Delete modules from Firebase Realtime Database (modules/ and trainerModules/<uid>/<moduleId>).
 *
 * Prereqs: Node, firebase-admin.
 *
 * Credentials: either
 *   --credentials path/to/firebase-service-account.json
 *   or env GOOGLE_APPLICATION_CREDENTIALS (path to that JSON).
 * Database URL: env FIREBASE_DATABASE_URL (e.g. https://defendu-e7970-default-rtdb.firebaseio.com).
 *
 * Usage: node scripts/delete_modules.js [--credentials path/to/key.json] <module_id_1> [module_id_2 ...]
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let args = process.argv.slice(2);
let credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const idx = args.indexOf('--credentials');
if (idx !== -1 && args[idx + 1]) {
  credPath = args[idx + 1];
  args = args.slice(0, idx).concat(args.slice(idx + 2));
}
const moduleIds = args.filter(Boolean);

if (moduleIds.length === 0) {
  console.error('Usage: node scripts/delete_modules.js [--credentials path/to/key.json] <module_id_1> [module_id_2 ...]');
  process.exit(1);
}

const dbUrl = process.env.FIREBASE_DATABASE_URL;
if (!credPath || !dbUrl) {
  console.error('Need credentials and database URL.');
  console.error('  Option 1: --credentials path/to/firebase-service-account.json');
  console.error('  Option 2: set env GOOGLE_APPLICATION_CREDENTIALS to that path');
  console.error('  Also set env FIREBASE_DATABASE_URL (e.g. https://defendu-e7970-default-rtdb.firebaseio.com)');
  process.exit(1);
}

const absCredPath = path.isAbsolute(credPath) ? credPath : path.resolve(process.cwd(), credPath);
if (!fs.existsSync(absCredPath)) {
  console.error('Credentials file not found: ' + absCredPath);
  console.error('Download it from Firebase Console → Project settings → Service accounts → Generate new private key.');
  console.error('Save the JSON (e.g. as firebase-service-account.json in this folder) and pass its path.');
  process.exit(1);
}

const serviceAccount = require(absCredPath);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: dbUrl,
  });
}

const db = admin.database();

async function deleteModules() {
  for (const moduleId of moduleIds) {
    await db.ref(`modules/${moduleId}`).remove();
    console.log('Deleted modules/' + moduleId);

    const trainerSnap = await db.ref('trainerModules').once('value');
    const trainerData = trainerSnap.val() || {};
    for (const uid of Object.keys(trainerData)) {
      if (trainerData[uid] && trainerData[uid][moduleId] !== undefined) {
        await db.ref(`trainerModules/${uid}/${moduleId}`).remove();
        console.log('Deleted trainerModules/' + uid + '/' + moduleId);
      }
    }
  }
}

deleteModules()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
