import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createServer } from './index.js'

function makeTempDbPath() {
  return path.join(os.tmpdir(), `tmas-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
}

test('register, login, and create a level through the API', async () => {
  const tempDbPath = makeTempDbPath()
  process.env.DB_PATH = tempDbPath

  const server = createServer()
  const { address, close } = await new Promise((resolve, reject) => {
    const listener = server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('server did not bind'))
        return
      }
      resolve({ address: addr, close: () => new Promise((done) => server.close(done)) })
    })
    listener.on('error', reject)
  })

  try {
    const registerRes = await fetch(`http://127.0.0.1:${address.port}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', email: 'ada@example.edu', password: 'secret123', role: 'student' }),
    })
    assert.equal(registerRes.status, 201)
    const registerBody = await registerRes.json()
    assert.equal(registerBody.user.role, 'student')
    assert.ok(registerBody.token)

    const loginRes = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@meridian.edu', password: 'admin123' }),
    })
    assert.equal(loginRes.status, 200)
    const loginBody = await loginRes.json()
    assert.equal(loginBody.user.role, 'admin')

    const createLevelRes = await fetch(`http://127.0.0.1:${address.port}/api/levels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${loginBody.token}`,
      },
      body: JSON.stringify({ name: 'Level 500', order: 5, status: 'active' }),
    })
    assert.equal(createLevelRes.status, 201)
    const createdLevel = await createLevelRes.json()
    assert.equal(createdLevel.level.name, 'Level 500')

    const levelsRes = await fetch(`http://127.0.0.1:${address.port}/api/levels`, {
      method: 'GET',
      headers: { authorization: `Bearer ${loginBody.token}` },
    })
    assert.equal(levelsRes.status, 200)
    const levels = await levelsRes.json()
    assert.ok(levels.levels.some((level) => level.name === 'Level 500'))
  } finally {
    await close()
    fs.unlinkSync(tempDbPath)
    delete process.env.DB_PATH
  }
})

test('returns the authenticated user from a valid token', async () => {
  const tempDbPath = makeTempDbPath()
  process.env.DB_PATH = tempDbPath

  const server = createServer()
  const { address, close } = await new Promise((resolve, reject) => {
    const listener = server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('server did not bind'))
        return
      }
      resolve({ address: addr, close: () => new Promise((done) => server.close(done)) })
    })
    listener.on('error', reject)
  })

  try {
    const registerRes = await fetch(`http://127.0.0.1:${address.port}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Grace', email: 'grace@example.edu', password: 'secret123', role: 'lecturer' }),
    })
    const registerBody = await registerRes.json()

    const meRes = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`, {
      headers: { authorization: `Bearer ${registerBody.token}` },
    })

    assert.equal(meRes.status, 200)
    const meBody = await meRes.json()
    assert.equal(meBody.user.email, 'grace@example.edu')
  } finally {
    await close()
    fs.unlinkSync(tempDbPath)
    delete process.env.DB_PATH
  }
})
