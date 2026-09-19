//const express = require('express');
//const session = require('express-session');
//const bcrypt = require('bcrypt');
//const { neon } = require('@neondatabase/serverless');
//const path = require('path');

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { neon } = require('@neondatabase/serverless');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// BASE DE DATOS NEON / POSTGRESQL
// ========================================

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL no está configurada.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// ========================================
// MIDDLEWARE
// ========================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


//app.use(session({
//  secret: process.env.SESSION_SECRET || 'solo-desarrollo-local',
//  resave: false,
//  saveUninitialized: false,
//  cookie: {
//    httpOnly: true,
//    sameSite: 'lax',
//    secure: process.env.NODE_ENV === 'production',
//    maxAge: 60 * 60 * 1000
//  }
//}));

app.set('trust proxy', 1);

app.use(session({
  store: new pgSession({
    pool: pgPool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),

  secret: process.env.SESSION_SECRET || 'solo-desarrollo-local',

  resave: false,
  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 1000
  }
}));

// ========================================
// FUNCIONES AUXILIARES
// ========================================

function cleanText(value, max = 120) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function requireAuth(req, res, next) {
  if (req.session?.user) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({
      error: 'Sesión no válida. Inicie sesión.'
    });
  }

  return res.redirect('/login.html');
}

// ========================================
// INICIALIZAR BASE DE DATOS
// ========================================

async function initializeDatabase() {

  await sql`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      usuario VARCHAR(40) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol VARCHAR(40) NOT NULL DEFAULT 'Coordinador'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS estudiantes (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      cedula VARCHAR(20) NOT NULL,
      programa VARCHAR(100) NOT NULL,
      etapa VARCHAR(80) NOT NULL DEFAULT 'Revisión documental',
      estado VARCHAR(30) NOT NULL
        CHECK (
          estado IN (
            'Pendiente',
            'En proceso',
            'Retraso',
            'Completado'
          )
        ),
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Crear usuario administrador si no existe
  const admin = await sql`
    SELECT id
    FROM usuarios
    WHERE usuario = 'admin'
  `;

  if (admin.length === 0) {

    const hash = await bcrypt.hash('Admin123*', 10);

    await sql`
      INSERT INTO usuarios (
        usuario,
        password_hash,
        rol
      )
      VALUES (
        'admin',
        ${hash},
        'Coordinador'
      )
    `;

    console.log('Usuario administrador creado.');
  }

  // Crear datos iniciales si la tabla está vacía
  const countResult = await sql`
    SELECT COUNT(*)::int AS total
    FROM estudiantes
  `;

  if (countResult[0].total === 0) {

    const seeds = [
      [
        'Ana Torres',
        '8-123-4567',
        'Maestría en Ciencias Computacionales',
        'Revisión documental',
        'Pendiente'
      ],
      [
        'Carlos Méndez',
        '8-456-7890',
        'Posgrado en TI',
        'Aprobación de asesor',
        'En proceso'
      ],
      [
        'María López',
        'PE-12-3456',
        'Maestría en Ciencias Computacionales',
        'Sustentación',
        'Retraso'
      ],
      [
        'José Rodríguez',
        '8-888-1122',
        'Posgrado en TI',
        'Entrega de diploma',
        'Completado'
      ]
    ];

    for (const estudiante of seeds) {

      await sql`
        INSERT INTO estudiantes (
          nombre,
          cedula,
          programa,
          etapa,
          estado
        )
        VALUES (
          ${estudiante[0]},
          ${estudiante[1]},
          ${estudiante[2]},
          ${estudiante[3]},
          ${estudiante[4]}
        )
      `;
    }

    console.log('Datos iniciales creados.');
  }
}

// ========================================
// LOGIN
// ========================================

app.get('/login.html', (req, res) => {

  res.sendFile(
    path.join(__dirname, 'public', 'login.html')
  );

});

app.post('/api/login', async (req, res) => {

  try {

    const usuario = cleanText(req.body.usuario, 40);
    const password = String(req.body.password || '');

    const users = await sql`
      SELECT *
      FROM usuarios
      WHERE usuario = ${usuario}
    `;

    const user = users[0];

    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {

      return res.status(401).json({
        error: 'Usuario o contraseña incorrectos.'
      });
    }

    req.session.user = {
      id: user.id,
      usuario: user.usuario,
      rol: user.rol
    };

    res.json({
      message: 'Inicio de sesión correcto.',
      user: req.session.user
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error interno del servidor.'
    });
  }
});

// ========================================
// LOGOUT
// ========================================

app.post('/api/logout', (req, res) => {

  req.session.destroy(() => {

    res.json({
      message: 'Sesión cerrada.'
    });

  });

});

// ========================================
// CONSULTAR SESIÓN
// ========================================

app.get('/api/session', requireAuth, (req, res) => {

  res.json({
    user: req.session.user
  });

});

// ========================================
// FRONTEND
// ========================================

app.get('/', requireAuth, (req, res) => {

  res.sendFile(
    path.join(__dirname, 'public', 'index.html')
  );

});

app.use(
  '/assets',
  express.static(
    path.join(__dirname, 'public')
  )
);

// ========================================
// READ - LISTAR ESTUDIANTES
// ========================================

app.get('/api/estudiantes', requireAuth, async (req, res) => {

  try {

    const estado =
      cleanText(req.query.estado || '', 30);

    const buscar =
      cleanText(req.query.buscar || '', 80);

    let estudiantes;

    if (
      estado &&
      estado !== 'Todos' &&
      buscar
    ) {

      estudiantes = await sql`
        SELECT *
        FROM estudiantes
        WHERE estado = ${estado}
        AND (
          nombre ILIKE ${'%' + buscar + '%'}
          OR cedula ILIKE ${'%' + buscar + '%'}
        )
        ORDER BY id DESC
      `;

    } else if (
      estado &&
      estado !== 'Todos'
    ) {

      estudiantes = await sql`
        SELECT *
        FROM estudiantes
        WHERE estado = ${estado}
        ORDER BY id DESC
      `;

    } else if (buscar) {

      estudiantes = await sql`
        SELECT *
        FROM estudiantes
        WHERE
          nombre ILIKE ${'%' + buscar + '%'}
          OR cedula ILIKE ${'%' + buscar + '%'}
        ORDER BY id DESC
      `;

    } else {

      estudiantes = await sql`
        SELECT *
        FROM estudiantes
        ORDER BY id DESC
      `;

    }

    res.json(estudiantes);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'No se pudo consultar.'
    });

  }

});

// ========================================
// READ - ESTUDIANTE POR ID
// ========================================

app.get('/api/estudiantes/:id', requireAuth, async (req, res) => {

  try {

    const rows = await sql`
      SELECT *
      FROM estudiantes
      WHERE id = ${req.params.id}
    `;

    if (rows.length === 0) {

      return res.status(404).json({
        error: 'Registro no encontrado.'
      });

    }

    res.json(rows[0]);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error al consultar.'
    });

  }

});

// ========================================
// CREATE
// ========================================

app.post('/api/estudiantes', requireAuth, async (req, res) => {

  try {

    const nombre =
      cleanText(req.body.nombre, 100);

    const cedula =
      cleanText(req.body.cedula, 20);

    const programa =
      cleanText(req.body.programa, 100);

    const etapa =
      cleanText(
        req.body.etapa || 'Revisión documental',
        80
      );

    const estado =
      cleanText(req.body.estado, 30);

    const validStates = [
      'Pendiente',
      'En proceso',
      'Retraso',
      'Completado'
    ];

    if (
      nombre.length < 3 ||
      !cedula ||
      !programa ||
      !validStates.includes(estado)
    ) {

      return res.status(400).json({
        error: 'Datos inválidos o incompletos.'
      });

    }

    const result = await sql`
      INSERT INTO estudiantes (
        nombre,
        cedula,
        programa,
        etapa,
        estado
      )
      VALUES (
        ${nombre},
        ${cedula},
        ${programa},
        ${etapa},
        ${estado}
      )
      RETURNING id
    `;

    res.status(201).json({
      message: 'Estudiante creado correctamente.',
      id: result[0].id
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'No se pudo crear el registro.'
    });

  }

});

// ========================================
// UPDATE
// ========================================

app.put('/api/estudiantes/:id', requireAuth, async (req, res) => {

  try {

    const nombre =
      cleanText(req.body.nombre, 100);

    const cedula =
      cleanText(req.body.cedula, 20);

    const programa =
      cleanText(req.body.programa, 100);

    const etapa =
      cleanText(req.body.etapa, 80);

    const estado =
      cleanText(req.body.estado, 30);

    const validStates = [
      'Pendiente',
      'En proceso',
      'Retraso',
      'Completado'
    ];

    if (
      nombre.length < 3 ||
      !cedula ||
      !programa ||
      !etapa ||
      !validStates.includes(estado)
    ) {

      return res.status(400).json({
        error: 'Datos inválidos.'
      });

    }

    const result = await sql`
      UPDATE estudiantes
      SET
        nombre = ${nombre},
        cedula = ${cedula},
        programa = ${programa},
        etapa = ${etapa},
        estado = ${estado},
        actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ${req.params.id}
      RETURNING id
    `;

    if (result.length === 0) {

      return res.status(404).json({
        error: 'Registro no encontrado.'
      });

    }

    res.json({
      message: 'Estudiante actualizado correctamente.'
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'No se pudo actualizar.'
    });

  }

});

// ========================================
// DELETE
// ========================================

app.delete('/api/estudiantes/:id', requireAuth, async (req, res) => {

  try {

    const result = await sql`
      DELETE FROM estudiantes
      WHERE id = ${req.params.id}
      RETURNING id
    `;

    if (result.length === 0) {

      return res.status(404).json({
        error: 'Registro no encontrado.'
      });

    }

    res.json({
      message: 'Estudiante eliminado correctamente.'
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'No se pudo eliminar.'
    });

  }

});

// ========================================
// KPIs
// ========================================

app.get('/api/kpis', requireAuth, async (req, res) => {

  try {

    const total = await sql`
      SELECT COUNT(*)::int AS total
      FROM estudiantes
    `;

    const retraso = await sql`
      SELECT COUNT(*)::int AS total
      FROM estudiantes
      WHERE estado = 'Retraso'
    `;

    const proceso = await sql`
      SELECT COUNT(*)::int AS total
      FROM estudiantes
      WHERE estado = 'En proceso'
    `;

    res.json({
      activos: total[0].total,
      retraso: retraso[0].total,
      proceso: proceso[0].total
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'No se pudieron consultar los indicadores.'
    });

  }

});

// ========================================
// INICIALIZACIÓN
// ========================================

const initializationPromise = initializeDatabase()
  .then(() => {
    console.log('Base de datos PostgreSQL inicializada.');
  })
  .catch(error => {
    console.error(
      'Error inicializando PostgreSQL:',
      error
    );
    throw error;
  });

// Evita procesar solicitudes antes de inicializar las tablas.
app.use(async (req, res, next) => {
  try {
    await initializationPromise;
    next();
  } catch (error) {
    res.status(500).json({
      error: 'No se pudo inicializar la base de datos.'
    });
  }
});

// Arranque local
if (require.main === module) {

  initializationPromise
    .then(() => {

      app.listen(PORT, () => {

        console.log(
          `Servidor ejecutándose en http://localhost:${PORT}`
        );

        console.log(
          'Usuario de prueba: admin'
        );

      });

    })
    .catch(error => {

      console.error(error);
      process.exit(1);

    });

}

// Vercel importa la aplicación Express
module.exports = app;