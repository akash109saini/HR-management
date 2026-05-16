// ===========================================================
// MongoDB user provisioning script for HRMS
// Run ONCE against an UN-AUTHENTICATED mongod (localhost exception),
// then enable authorization and restart mongod.
//
// Usage:
//   mongosh --quiet --file /app/deploy/mongo/init-users.js
//
// IMPORTANT: Replace the three passwords below with values from
// /app/deploy/mongo/SECRETS.env BEFORE running.
// ===========================================================

const ROOT_USER = 'hrmsRoot';
const ROOT_PASS = '<<REPLACE_WITH_ROOT_PASS>>';

const APP_USER  = 'hrmsApp';
const APP_PASS  = '<<REPLACE_WITH_APP_PASS>>';

const READ_USER = 'hrmsReadonly';
const READ_PASS = '<<REPLACE_WITH_READ_PASS>>';

const APP_DB    = 'hrms_prod';

// ---------- 1) Root / cluster admin in the admin db ----------
db = db.getSiblingDB('admin');

if (!db.getUser(ROOT_USER)) {
  db.createUser({
    user: ROOT_USER,
    pwd:  ROOT_PASS,
    roles: [
      { role: 'root', db: 'admin' }
    ]
  });
  print('Created root user: ' + ROOT_USER);
} else {
  print('Root user already exists: ' + ROOT_USER);
}

// ---------- 2) Application user (scoped to APP_DB only) ----------
db = db.getSiblingDB(APP_DB);

if (!db.getUser(APP_USER)) {
  db.createUser({
    user: APP_USER,
    pwd:  APP_PASS,
    roles: [
      { role: 'readWrite', db: APP_DB },
      // dbAdmin lets the backend create indexes during startup; remove if you
      // run a separate migration step.
      { role: 'dbAdmin',  db: APP_DB }
    ]
  });
  print('Created app user: ' + APP_USER + ' on ' + APP_DB);
} else {
  print('App user already exists: ' + APP_USER);
}

// ---------- 3) Read-only user for analytics / backups ----------
if (!db.getUser(READ_USER)) {
  db.createUser({
    user: READ_USER,
    pwd:  READ_PASS,
    roles: [ { role: 'read', db: APP_DB } ]
  });
  print('Created readonly user: ' + READ_USER + ' on ' + APP_DB);
} else {
  print('Readonly user already exists: ' + READ_USER);
}

print('--- Done. Now enable security.authorization in mongod.conf and restart. ---');
