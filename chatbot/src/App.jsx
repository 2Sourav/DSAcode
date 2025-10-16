import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function Header() {
  return (
    <header className="chat-header">
      <div className="brand">
        <span className="logo" aria-hidden>💬</span>
        <h1>React Chatbot</h1>
      </div>
      <a className="gh" href="https://vitejs.dev" target="_blank" rel="noreferrer">Vite</a>
    </header>
  )
}

function MessageBubble({ role, text }) {
  return (
    <div className={"message " + (role === 'user' ? 'from-user' : 'from-bot')}>
      <div className="bubble" role="text">{text}</div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="typing">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </div>
  )
}

function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, '').trim()
}

function generateBotReply(text) {
  const t = normalize(text)
  if (!t) return "Could you clarify that?"

  if (/(^|\b)(hi|hello|hey|hola)(\b|!|\.)/.test(t)) {
    return "Hello! How can I help you today?"
  }

  if (/help|support|assist/.test(t)) {
    return "I can greet, tell the time/date, echo text, or tell a joke. Try 'time', 'date', 'echo your text', or 'joke'."
  }

  if (/\btime\b/.test(t)) {
    return `The current time is ${new Date().toLocaleTimeString()}.`
  }

  if (/\b(date|day)\b/.test(t)) {
    return `Today is ${new Date().toLocaleDateString()}.`
  }

  if (/\bjoke|funny\b/.test(t)) {
    return "Why do programmers prefer dark mode? Because light attracts bugs."
  }

  const echoMatch = t.match(/\becho\s+(.+)/)
  if (echoMatch) {
    return echoMatch[1]
  }

  return `You said: "${text}". I'm a simple demo bot.`
}

async function fetchLLMReply({ provider, messages }) {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, messages }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(text || 'Request failed')
  }
  const data = await resp.json()
  return data.text
}

export default function App() {
  const [messages, setMessages] = useState(() => [
    { id: 1, role: 'bot', text: 'Hi! I\'m your assistant. Ask me anything.' },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [provider, setProvider] = useState('openai') // 'openai' | 'gemini'
  const nextId = useRef(2)
  const listRef = useRef(null)

  const canSend = useMemo(() => input.trim().length > 0 && !isTyping, [input, isTyping])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    if (!canSend) return

    const userMessage = { id: nextId.current++, role: 'user', text: input.trim() }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
  }, [canSend, input])

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const form = e.currentTarget.form
      if (form) form.requestSubmit()
    }
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    if (last.role !== 'user') return

    let cancelled = false
    setIsTyping(true)

    const run = async () => {
      try {
        const history = messages.map(m => ({ role: m.role === 'bot' ? 'assistant' : m.role, text: m.text }))
        const text = await fetchLLMReply({ provider, messages: history })
        if (cancelled) return
        const botMessage = { id: nextId.current++, role: 'bot', text }
        setMessages((prev) => [...prev, botMessage])
      } catch (err) {
        if (cancelled) return
        const botMessage = { id: nextId.current++, role: 'bot', text: `Error: ${String(err?.message || err)}` }
        setMessages((prev) => [...prev, botMessage])
      } finally {
        if (!cancelled) setIsTyping(false)
      }
    }
    run()

    return () => { cancelled = true }
  }, [messages, provider])

  return (
    <div className="app">
      <Header />
      <main className="chat" ref={listRef} aria-live="polite" aria-relevant="additions">
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} text={m.text} />
        ))}
        {isTyping && <TypingIndicator />}
      </main>
      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message..."
          rows={1}
          aria-label="Message"
        />
        <button type="submit" disabled={!canSend} aria-label="Send message">Send</button>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Model provider">
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </select>
      </form>
    </div>
  )
}
