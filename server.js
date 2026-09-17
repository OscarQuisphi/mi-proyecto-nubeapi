const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const dbDir = path.join(__dirname, 'database');
const dbPath = path.join(dbDir, 'titulacion.db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new sqlite3.Database(dbPath);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'crud-academico-up-2026-cambiar-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 1000 }
}));

function cleanText(value, max = 120) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sesión no válida. Inicie sesión.' });
  return res.redirect('/login.html');
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

async function initializeDatabase() {
  await run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'Coordinador'
  )`);

  await run(`CREATE TABLE IF NOT EXISTS estudiantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cedula TEXT NOT NULL,
    programa TEXT NOT NULL,
    etapa TEXT NOT NULL DEFAULT 'Revisión documental',
    estado TEXT NOT NULL CHECK(estado IN ('Pendiente','En proceso','Retraso','Completado')),
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const admin = await get('SELECT id FROM usuarios WHERE usuario = ?', ['admin']);
  if (!admin) {
    const hash = await bcrypt.hash('Admin123*', 10);
    await run('INSERT INTO usuarios (usuario, password_hash, rol) VALUES (?, ?, ?)', ['admin', hash, 'Coordinador']);
  }

  const count = await get('SELECT COUNT(*) AS total FROM estudiantes');
  if (count.total === 0) {
    const seeds = [
      ['Ana Torres', '8-123-4567', 'Maestría en Ciencias Computacionales', 'Revisión documental', 'Pendiente'],
      ['Carlos Méndez', '8-456-7890', 'Posgrado en TI', 'Aprobación de asesor', 'En proceso'],
      ['María López', 'PE-12-3456', 'Maestría en Ciencias Computacionales', 'Sustentación', 'Retraso'],
      ['José Rodríguez', '8-888-1122', 'Posgrado en TI', 'Entrega de diploma', 'Completado']
    ];
    for (const s of seeds) await run('INSERT INTO estudiantes (nombre, cedula, programa, etapa, estado) VALUES (?, ?, ?, ?, ?)', s);
  }
}

app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.post('/api/login', async (req, res) => {
  try {
    const usuario = cleanText(req.body.usuario, 40);
    const password = String(req.body.password || '');
    const user = await get('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    req.session.user = { id: user.id, usuario: user.usuario, rol: user.rol };
    res.json({ message: 'Inicio de sesión correcto.', user: req.session.user });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Error interno del servidor.' });
  }
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ message: 'Sesión cerrada.' })));
app.get('/api/session', requireAuth, (req, res) => res.json({ user: req.session.user }));

app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use('/assets', express.static(path.join(__dirname, 'public')));

app.get('/api/estudiantes', requireAuth, async (req, res) => {
  try {
    const estado = cleanText(req.query.estado || '', 30);
    const buscar = cleanText(req.query.buscar || '', 80);
    let sql = 'SELECT * FROM estudiantes WHERE 1=1';
    const params = [];
    if (estado && estado !== 'Todos') { sql += ' AND estado = ?'; params.push(estado); }
    if (buscar) { sql += ' AND (nombre LIKE ? OR cedula LIKE ?)'; params.push(`%${buscar}%`, `%${buscar}%`); }
    sql += ' ORDER BY id DESC';
    res.json(await all(sql, params));
  } catch (e) { console.error(e); res.status(500).json({ error: 'No se pudo consultar.' }); }
});

app.get('/api/estudiantes/:id', requireAuth, async (req, res) => {
  try {
    const row = await get('SELECT * FROM estudiantes WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: 'Error al consultar.' }); }
});

app.post('/api/estudiantes', requireAuth, async (req, res) => {
  try {
    const nombre = cleanText(req.body.nombre, 100);
    const cedula = cleanText(req.body.cedula, 20);
    const programa = cleanText(req.body.programa, 100);
    const etapa = cleanText(req.body.etapa || 'Revisión documental', 80);
    const estado = cleanText(req.body.estado, 30);
    const validStates = ['Pendiente', 'En proceso', 'Retraso', 'Completado'];
    if (nombre.length < 3 || !cedula || !programa || !validStates.includes(estado)) {
      return res.status(400).json({ error: 'Datos inválidos o incompletos.' });
    }
    const result = await run('INSERT INTO estudiantes (nombre, cedula, programa, etapa, estado) VALUES (?, ?, ?, ?, ?)', [nombre, cedula, programa, etapa, estado]);
    res.status(201).json({ message: 'Estudiante creado correctamente.', id: result.id });
  } catch (e) { console.error(e); res.status(500).json({ error: 'No se pudo crear el registro.' }); }
});

app.put('/api/estudiantes/:id', requireAuth, async (req, res) => {
  try {
    const nombre = cleanText(req.body.nombre, 100);
    const cedula = cleanText(req.body.cedula, 20);
    const programa = cleanText(req.body.programa, 100);
    const etapa = cleanText(req.body.etapa, 80);
    const estado = cleanText(req.body.estado, 30);
    const validStates = ['Pendiente', 'En proceso', 'Retraso', 'Completado'];
    if (nombre.length < 3 || !cedula || !programa || !etapa || !validStates.includes(estado)) {
      return res.status(400).json({ error: 'Datos inválidos.' });
    }
    const result = await run(`UPDATE estudiantes SET nombre=?, cedula=?, programa=?, etapa=?, estado=?, actualizado_en=CURRENT_TIMESTAMP WHERE id=?`, [nombre, cedula, programa, etapa, estado, req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json({ message: 'Estudiante actualizado correctamente.' });
  } catch (e) { res.status(500).json({ error: 'No se pudo actualizar.' }); }
});

app.delete('/api/estudiantes/:id', requireAuth, async (req, res) => {
  try {
    const result = await run('DELETE FROM estudiantes WHERE id = ?', [req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json({ message: 'Estudiante eliminado correctamente.' });
  } catch (e) { res.status(500).json({ error: 'No se pudo eliminar.' }); }
});

app.get('/api/kpis', requireAuth, async (req, res) => {
  const total = await get('SELECT COUNT(*) total FROM estudiantes');
  const retraso = await get("SELECT COUNT(*) total FROM estudiantes WHERE estado='Retraso'");
  const proceso = await get("SELECT COUNT(*) total FROM estudiantes WHERE estado='En proceso'");
  res.json({ activos: total.total, retraso: retraso.total, proceso: proceso.total });
});

initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`Base de datos SQLite: ${dbPath}`);
    console.log('Usuario de prueba: admin | Clave: Admin123*');
  });
}).catch(err => { console.error('Error al inicializar la base de datos:', err); process.exit(1); });
