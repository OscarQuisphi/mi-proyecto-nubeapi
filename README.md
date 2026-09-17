# Sistema de Seguimiento de Titulación - CRUD

## Requisitos
- Node.js 18 o superior recomendado
- npm

## Instalación
1. Abra una terminal dentro de la carpeta del proyecto.
2. Ejecute: `npm install`
3. Ejecute: `npm start`
4. Abra: http://localhost:3000

## Credenciales académicas de prueba
- Usuario: `admin`
- Contraseña: `Admin123*`

## Base de datos
Se crea automáticamente en `database/titulacion.db` al iniciar el servidor.

## Endpoints principales
- POST `/api/login`
- POST `/api/logout`
- GET `/api/session`
- GET `/api/estudiantes`
- GET `/api/estudiantes/:id`
- POST `/api/estudiantes`
- PUT `/api/estudiantes/:id`
- DELETE `/api/estudiantes/:id`
- GET `/api/kpis`
