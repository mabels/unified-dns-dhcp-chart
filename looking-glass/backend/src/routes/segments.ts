// Segments list endpoint

import { Hono } from 'hono'
import { loadConfig } from '../config.js'

const segments = new Hono()

segments.get('/', (c) => {
  const config = loadConfig()
  return c.json(config.endpoints)
})

export default segments
