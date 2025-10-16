import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '1mb' }))

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

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
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

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const body = {
    contents: toGeminiContents(messages),
    generationConfig: {
      temperature: 0.7,
    },
  }

  const resp = await fetch(url, {
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

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    providers: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
    },
  })
})

app.post('/api/chat', async (req, res) => {
  try {
    const { provider = 'openai', messages } = req.body || {}
    const normalized = normalizeMessages(messages)
    if (normalized.length === 0) {
      return res.status(400).json({ error: 'No messages provided' })
    }

    const fn = provider === 'gemini' ? callGemini : callOpenAI
    const text = await fn(normalized)
    res.json({ text })
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err || 'Unknown error') })
  }
})

app.listen(PORT, () => {
  console.log(`LLM proxy listening on http://localhost:${PORT}`)
})
