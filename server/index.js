import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

function getDbPath() {
  return process.env.DB_PATH || path.join(process.cwd(), 'server', 'data.json')
}

const DEFAULT_ADMIN = {
  id: 'admin-1',
  name: 'System Admin',
  email: 'admin@meridian.edu',
  password: 'admin123',
  role: 'admin',
}

function ensureDbFile() {
  const dbPath = getDbPath()
  if (!fs.existsSync(dbPath)) {
    const initialState = {
      users: [DEFAULT_ADMIN],
      levels: [],
      courses: [],
      materials: [],
      quizzes: [],
    }
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    fs.writeFileSync(dbPath, JSON.stringify(initialState, null, 2))
  }
}

function readDb() {
  ensureDbFile()
  return JSON.parse(fs.readFileSync(getDbPath(), 'utf8'))
}

function writeDb(state) {
  fs.writeFileSync(getDbPath(), JSON.stringify(state, null, 2))
}

function createToken(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      if (!data) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(data))
      } catch (error) {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function getAuthUser(req) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return null

  const state = readDb()
  const user = state.users.find((entry) => {
    const expectedToken = createToken({ sub: entry.id, email: entry.email, role: entry.role })
    return token === expectedToken
  })

  return user || null
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}

export function createServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      try {
        const body = await parseJsonBody(req)
        const state = readDb()
        const existing = state.users.find((user) => user.email === body.email)
        if (existing) {
          return sendJson(res, 409, { error: 'User already exists' })
        }

        const user = {
          id: `user-${Date.now()}`,
          name: body.name || 'User',
          email: body.email,
          password: body.password,
          role: body.role || 'student',
        }

        state.users.push(user)
        writeDb(state)

        const token = createToken({ sub: user.id, email: user.email, role: user.role })
        return sendJson(res, 201, { user: { id: user.id, name: user.name, email: user.email, role: user.role }, token })
      } catch (error) {
        return sendJson(res, 400, { error: error.message })
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      try {
        const body = await parseJsonBody(req)
        const state = readDb()
        const user = state.users.find((entry) => entry.email === body.email && entry.password === body.password)
        if (!user) {
          return sendJson(res, 401, { error: 'Invalid credentials' })
        }

        const token = createToken({ sub: user.id, email: user.email, role: user.role })
        return sendJson(res, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role }, token })
      } catch (error) {
        return sendJson(res, 400, { error: error.message })
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      const user = getAuthUser(req)
      if (!user) {
        return sendJson(res, 401, { error: 'Unauthorized' })
      }

      return sendJson(res, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role } })
    }

    if (req.method === 'GET' && url.pathname === '/api/levels') {
      const user = getAuthUser(req)
      if (!user || user.role !== 'admin') {
        return sendJson(res, 403, { error: 'Forbidden' })
      }

      const state = readDb()
      return sendJson(res, 200, { levels: state.levels })
    }

    if (req.method === 'POST' && url.pathname === '/api/levels') {
      const user = getAuthUser(req)
      if (!user || user.role !== 'admin') {
        return sendJson(res, 403, { error: 'Forbidden' })
      }

      try {
        const body = await parseJsonBody(req)
        const state = readDb()
        const level = {
          id: `level-${Date.now()}`,
          name: body.name,
          order: body.order || state.levels.length + 1,
          status: body.status || 'active',
          createdAt: new Date().toISOString(),
        }
        state.levels.push(level)
        writeDb(state)
        return sendJson(res, 201, { level })
      } catch (error) {
        return sendJson(res, 400, { error: error.message })
      }
    }

    return sendJson(res, 404, { error: 'Not found' })
  })

  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 4000)
  const server = createServer()
  server.listen(port, () => {
    console.log(`TMAS server listening on port ${port}`)
  })
}
