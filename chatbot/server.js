import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const DEFAULT_PROVIDER = process.env.DEFAULT_PROVIDER || 'gemini'
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 20000)

app.use(cors())
app.use(express.json({ limit: '1mb' }))

function describeError(err) {
  if (!err) {
    return {
      message: 'Unknown error',
      cause: null,
      code: null,
      stack: null,
    }
  }

  const cause = err.cause && typeof err.cause === 'object'
    ? {
        message: err.cause.message || null,
        code: err.cause.code || null,
        errno: err.cause.errno || null,
      }
    : null

  return {
    message: err.message || String(err),
    code: err.code || null,
    cause,
    stack: err.stack || null,
  }
}

function toClientErrorMessage(err) {
  const details = describeError(err)
  const causeBits = [details.cause?.code, details.cause?.message].filter(Boolean)
  const causeText = causeBits.length > 0 ? ` Cause: ${causeBits.join(' - ')}` : ''

  if (details.message === 'fetch failed') {
    return `Unable to reach the Gemini API from the server. Check your internet connection, firewall, VPN, proxy, or antivirus settings.${causeText}`
  }

  return `${details.message}${causeText}`
}

function logServerError(context, err) {
  const details = describeError(err)
  console.error(`[${new Date().toISOString()}] ${context}`)
  console.error(details)
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages
    .filter(m => m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'bot' || m.role === 'assistant' || m.role === 'system'))
    .map(m => ({ role: m.role === 'bot' ? 'assistant' : m.role, content: m.text }))
}

async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
    temperature: 0.7,
  }

  const resp = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OpenAI error ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('OpenAI returned no content')
  return content
}

function toGeminiContents(messages) {
  const contents = []
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : (m.role === 'system' ? 'user' : m.role)
    contents.push({ role, parts: [{ text: m.content }] })
  }
  return contents
}

async function callGemini(messages) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`

  const body = {
    contents: toGeminiContents(messages),
    generationConfig: {
      temperature: 0.7,
    },
  }

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Gemini error ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  const candidates = data?.candidates || []
  const text = candidates[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) throw new Error('Gemini returned no text')
  return text
}

async function debugGeminiConnection() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const url = `${GEMINI_API_BASE}/models?key=${apiKey}`
  const resp = await fetchWithTimeout(url)

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Gemini models lookup error ${resp.status}: ${text}`)
  }

  const data = await resp.json()
  const modelNames = Array.isArray(data?.models) ? data.models.map((model) => model.name) : []

  return {
    configuredModel: GEMINI_MODEL,
    configuredModelAvailable: modelNames.includes(`models/${GEMINI_MODEL}`),
    availableModels: modelNames,
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    defaultProvider: DEFAULT_PROVIDER,
    geminiModel: GEMINI_MODEL,
    providers: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
    },
  })
})

app.get('/api/debug/gemini', async (req, res) => {
  try {
    const result = await debugGeminiConnection()
    res.json({
      ok: true,
      ...result,
    })
  } catch (err) {
    logServerError('Gemini debug check failed', err)
    res.status(500).json({
      ok: false,
      error: toClientErrorMessage(err),
    })
  }
})

app.post('/api/chat', async (req, res) => {
  try {
    const { provider = DEFAULT_PROVIDER, messages } = req.body || {}
    const normalized = normalizeMessages(messages)
    if (normalized.length === 0) {
      return res.status(400).json({ error: 'No messages provided' })
    }

    const fn = provider === 'gemini' ? callGemini : callOpenAI
    const text = await fn(normalized)
    res.json({ text })
  } catch (err) {
    logServerError('Chat request failed', err)
    res.status(500).json({ error: toClientErrorMessage(err) })
  }
})

app.listen(PORT, () => {
  console.log(`LLM proxy listening on http://localhost:${PORT}`)
})
