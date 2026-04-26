const hasMissingRelationError = (err, relationName) => {
  const text = String(err?.message || err || '');
  return (
    (text.includes('42P01') && text.includes(relationName))
    || (text.includes('PGRST205') && text.includes(relationName))
  );
};

const normalizeActor = (value) => {
  const actor = String(value || '').trim();
  return actor ? actor.slice(0, 80) : 'admin';
};

const normalizeAction = (value) => {
  const action = String(value || '').trim();
  return action ? action.slice(0, 80) : 'unknown';
};

const normalizeTargetType = (value) => {
  const targetType = String(value || '').trim();
  return targetType ? targetType.slice(0, 40) : null;
};

const normalizeTargetId = (value) => {
  const targetId = String(value || '').trim();
  return targetId ? targetId.slice(0, 80) : null;
};

const normalizeMessage = (value) => {
  const message = String(value || '').trim();
  return message ? message.slice(0, 500) : null;
};

const appendActivityLog = async (supabaseRequest, entry) => {
  if (typeof supabaseRequest !== 'function') return;

  const row = {
    actor: normalizeActor(entry?.actor),
    action: normalizeAction(entry?.action),
    target_type: normalizeTargetType(entry?.targetType),
    target_id: normalizeTargetId(entry?.targetId),
    message: normalizeMessage(entry?.message),
    metadata: entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : null,
  };

  try {
    await supabaseRequest('/rest/v1/admin_activity_logs', {
      method: 'POST',
      body: row,
      headers: { Prefer: 'return=minimal' },
    });
  } catch (err) {
    if (!hasMissingRelationError(err, 'admin_activity_logs')) throw err;
  }
};

const loadRecentActivityLogs = async (supabaseRequest, limit = 50) => {
  if (typeof supabaseRequest !== 'function') return [];

  const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(Number(limit), 1), 200) : 50;

  try {
    return (await supabaseRequest(`/rest/v1/admin_activity_logs?select=id,actor,action,target_type,target_id,message,metadata,created_at&order=created_at.desc&limit=${safeLimit}`)) || [];
  } catch (err) {
    if (!hasMissingRelationError(err, 'admin_activity_logs')) throw err;
    return [];
  }
};

module.exports = {
  appendActivityLog,
  loadRecentActivityLogs,
};
