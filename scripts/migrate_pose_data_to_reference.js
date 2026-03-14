#!/usr/bin/env node
/**
 * Migrate inline pose data off module documents into referencePoseData/{moduleId}.
 * This keeps module docs small so getApprovedModules() (dashboard) loads faster.
 *
 * For each module that has referencePoseSequence or referencePoseSequences:
 *   1. Writes that data to referencePoseData/{moduleId} as { sequences, focus }.
 *   2. Sets hasReferencePose: true on the module and removes referencePoseSequence
 *      and referencePoseSequences from the module doc.
 *
 * Prereqs: Node, firebase-admin.
 *
 * Credentials: either
 *   --credentials path/to/firebase-service-account.json
 *   or env GOOGLE_APPLICATION_CREDENTIALS (path to that JSON).
 * Database URL: env FIREBASE_DATABASE_URL (e.g. https://defendu-e7970-default-rtdb.asia-southeast1.firebasedatabase.app).
 *
 * Usage: node scripts/migrate_pose_data_to_reference.js [--credentials path/to/key.json] [--dry-run]
 *
 * Use --dry-run to only print what would be migrated without writing.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
args = args.filter((a) => a !== '--dry-run');

let credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const idx = args.indexOf('--credentials');
if (idx !== -1 && args[idx + 1]) {
  credPath = args[idx + 1];
  args = args.slice(0, idx).concat(args.slice(idx + 2));
}

const dbUrl = process.env.FIREBASE_DATABASE_URL;
if (!credPath || !dbUrl) {
  console.error('Need credentials and database URL.');
  console.error('  Option 1: --credentials path/to/firebase-service-account.json');
  console.error('  Option 2: set env GOOGLE_APPLICATION_CREDENTIALS to that path');
  console.error('  Also set env FIREBASE_DATABASE_URL (e.g. https://defendu-e7970-default-rtdb.asia-southeast1.firebasedatabase.app)');
  process.exit(1);
}

const absCredPath = path.isAbsolute(credPath) ? credPath : path.resolve(process.cwd(), credPath);
if (!fs.existsSync(absCredPath)) {
  console.error('Credentials file not found: ' + absCredPath);
  console.error('Download from Firebase Console → Project settings → Service accounts → Generate new private key.');
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

/** Turn Firebase object-with-numeric-keys or array into a plain array. */
function toArray(val) {
  if (val == null) return null;
  if (Array.isArray(val)) return val;
  if (typeof val !== 'object') return null;
  const keys = Object.keys(val)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));
  if (keys.length === 0) return null;
  return keys.map((k) => val[k]);
}

/** Get sequences array from module: referencePoseSequences or [referencePoseSequence]. */
function getSequences(module) {
  const seqs = module.referencePoseSequences;
  const single = module.referencePoseSequence;
  const arrSeqs = toArray(seqs);
  if (arrSeqs && arrSeqs.length > 0) return arrSeqs;
  const arrSingle = toArray(single);
  if (arrSingle && arrSingle.length > 0) return [arrSingle];
  return null;
}

async function migrate() {
  const modulesSnap = await db.ref('modules').once('value');
  const modulesVal = modulesSnap.val();
  if (!modulesVal || typeof modulesVal !== 'object') {
    console.log('No modules found.');
    return;
  }

  const moduleIds = Object.keys(modulesVal);
  let migrated = 0;
  let skipped = 0;

  for (const moduleId of moduleIds) {
    const module = modulesVal[moduleId];
    if (!module || typeof module !== 'object') continue;

    const sequences = getSequences(module);
    if (!sequences || sequences.length === 0) {
      skipped++;
      continue;
    }

    const focus =
      module.referencePoseFocus === 'punching' ||
      module.referencePoseFocus === 'kicking' ||
      module.referencePoseFocus === 'full'
        ? module.referencePoseFocus
        : 'full';

    if (dryRun) {
      console.log(
        `[dry-run] Would migrate ${moduleId} (${module.moduleTitle || moduleId}): ${sequences.length} sequence(s), focus=${focus}`
      );
      migrated++;
      continue;
    }

    const refDataRef = db.ref(`referencePoseData/${moduleId}`);
    await refDataRef.child('focus').set(focus);
    for (let i = 0; i < sequences.length; i++) {
      await refDataRef.child('sequences').child(i).set(sequences[i]);
    }
    console.log(`Wrote referencePoseData/${moduleId} (sequences: ${sequences.length}, focus: ${focus})`);

    const moduleRef = db.ref(`modules/${moduleId}`);
    await moduleRef.update({
      hasReferencePose: true,
      referencePoseFocus: focus,
    });
    try {
      await moduleRef.child('referencePoseSequence').remove();
    } catch (_) {}
    try {
      await moduleRef.child('referencePoseSequences').remove();
    } catch (_) {}
    console.log(`Slimmed modules/${moduleId} (removed inline pose data)`);
    migrated++;
  }

  console.log('');
  console.log(`Done. Migrated: ${migrated}, skipped (no inline pose): ${skipped}`);
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
