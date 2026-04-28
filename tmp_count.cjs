const { pool } = require('./server/db/pool');
(async () => {
  try {
    const res = await pool.query('SELECT COUNT(*) FROM checklist_items WHERE checklist_id = ', [29]);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
})();
