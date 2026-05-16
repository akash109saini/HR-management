// ============================================================
// Auto-run by the official mongo Docker image on FIRST start only.
// It runs AFTER the root user has been created from
// MONGO_INITDB_ROOT_USERNAME/PASSWORD, against MONGO_INITDB_DATABASE.
//
// We use process.env injected by the entrypoint script.
// ============================================================

const APP_DB    = process.env.MONGO_DB         || 'hrms_prod';
const APP_USER  = process.env.MONGO_APP_USER   || 'hrmsApp';
const APP_PASS  = process.env.MONGO_APP_PASS;
const READ_USER = process.env.MONGO_READ_USER  || 'hrmsReadonly';
const READ_PASS = process.env.MONGO_READ_PASS;

if (!APP_PASS || !READ_PASS) {
  print('ERROR: MONGO_APP_PASS or MONGO_READ_PASS env var is missing. Skipping user creation.');
  quit(1);
}

db = db.getSiblingDB(APP_DB);

db.createUser({
  user: APP_USER,
  pwd:  APP_PASS,
  roles: [
    { role: 'readWrite', db: APP_DB },
    { role: 'dbAdmin',   db: APP_DB }
  ]
});
print('Created app user: ' + APP_USER + ' on ' + APP_DB);

db.createUser({
  user: READ_USER,
  pwd:  READ_PASS,
  roles: [ { role: 'read', db: APP_DB } ]
});
print('Created readonly user: ' + READ_USER + ' on ' + APP_DB);
