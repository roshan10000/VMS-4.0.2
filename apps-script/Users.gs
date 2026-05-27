/* =============================================================================
 *  VMS  ·  Apps Script · Users.gs
 *  CRUD on the "Users" sheet.
 *  Columns:  Username | PasswordHash | Role | Status | CreatedAt
 * ============================================================================= */

function Users_find(username) {
  const sh = _sheet('Users');
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[0]).toLowerCase() === String(username).toLowerCase()) {
      return {
        rowIndex:     i + 1,
        username:     r[0],
        passwordHash: r[1],
        role:         r[2],
        status:       r[3],
        createdAt:    r[4],
      };
    }
  }
  return null;
}

function Users_list() {
  const sh = _sheet('Users');
  const data = sh.getDataRange().getValues();
  return data.slice(1)
    .filter(r => r[0])
    .map(r => ({
      username:  r[0],
      role:      r[2],
      status:    r[3],
      createdAt: r[4] ? new Date(r[4]).toISOString().slice(0, 10) : '',
    }));
}

function Users_save({ user }) {
  if (!user || !user.username) throw new Error('Username required');
  const sh = _sheet('Users');
  const existing = Users_find(user.username);

  if (!user.isUpdate) {
    if (existing) throw new Error('User already exists');
    if (!user.password) throw new Error('Password required');
    sh.appendRow([
      user.username,
      Auth_hash(user.password),
      user.role || 'User',
      user.status || 'Active',
      new Date().toISOString(),
    ]);
    return { created: true };
  } else {
    if (!existing) throw new Error('User not found');
    const row = existing.rowIndex;
    if (user.password) sh.getRange(row, 2).setValue(Auth_hash(user.password));
    if (user.role)     sh.getRange(row, 3).setValue(user.role);
    if (user.status)   sh.getRange(row, 4).setValue(user.status);
    return { updated: true };
  }
}

function Users_delete({ username }) {
  const u = Users_find(username);
  if (!u) throw new Error('User not found');
  _sheet('Users').deleteRow(u.rowIndex);
  return { deleted: true };
}
