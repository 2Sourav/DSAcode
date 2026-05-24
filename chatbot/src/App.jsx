import React, { useEffect, useMemo, useRef, useState } from 'react'

const SUGGESTIONS = [
  'Hello Gemini',
  'What can you do?',
  'Write a short motivational quote',
  'Explain arrays in simple words',
]

const SYSTEM_PROMPT = 'You are a friendly, concise chatbot inside a colorful React chat app. Give clear, helpful, natural responses and keep them suitable for a general audience.'

function formatTime() {
  return new Date().toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function renderMessageText(text) {
  const parts = text.split(/(\*\*.*?\*\*)/g)

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }

    return <React.Fragment key={index}>{part}</React.Fragment>
  })
}

async function fetchChatReply(messages) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: 'gemini',
      messages: [
        { role: 'system', text: SYSTEM_PROMPT },
        ...messages.map((message) => ({
          role: message.role,
          text: message.text,
        })),
      ],
    }),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.error || 'Unable to get a reply from Gemini right now.')
  }

  if (!data?.text) {
    throw new Error('Gemini returned an empty response.')
  }

  return data.text
}

function Header() {
  return (
    <header className="chat-header">
      <div className="brand-block">
        <div className="brand-badge" aria-hidden>
          AI
        </div>
        <div>
          <p className="eyebrow">Gemini Powered</p>
          <h1>ColorSplash Chat</h1>
        </div>
      </div>
      <div className="status-pill">Server connected</div>
    </header>
  )
}

function WelcomeCard({ onSuggestionClick }) {
  return (
    <section className="welcome-card">
      <p className="welcome-label">Server-side AI chatbot</p>
      <h2>Chat with Gemini through your Express backend.</h2>
      <p className="welcome-copy">
        Your API key stays on the server, while the React app only sends chat messages to your local API route.
      </p>
      <div className="suggestion-row">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="suggestion-chip"
            onClick={() => onSuggestionClick(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  )
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  return (
    <article className={`message ${isUser ? 'from-user' : 'from-bot'}`}>
      {!isUser && <div className="avatar bot-avatar">AI</div>}
      <div className="message-body">
        <div className="message-meta">
          <span>{isUser ? 'You' : 'Gemini'}</span>
          <span>{message.time}</span>
        </div>
        <div className="bubble">{renderMessageText(message.text)}</div>
      </div>
      {isUser && <div className="avatar user-avatar">You</div>}
    </article>
  )
}

function TypingIndicator() {
  return (
    <div className="message from-bot">
      <div className="avatar bot-avatar">AI</div>
      <div className="message-body">
        <div className="message-meta">
          <span>Gemini</span>
          <span>typing...</span>
        </div>
        <div className="bubble typing-bubble" aria-label="Gemini is typing">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'bot',
      text: 'Hi! I am connected to Gemini through your server. Ask me anything to start the conversation.',
      time: formatTime(),
    },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const nextId = useRef(2)
  const listRef = useRef(null)

  const canSend = useMemo(() => input.trim().length > 0 && !isTyping, [input, isTyping])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user') return

    let cancelled = false
    setIsTyping(true)

    const run = async () => {
      try {
        const reply = await fetchChatReply(messages)
        if (cancelled) return

        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: 'bot',
            text: reply,
            time: formatTime(),
          },
        ])
      } catch (error) {
        if (cancelled) return

        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: 'bot',
            text: `I hit a server error: ${String(error?.message || error)} Check the server terminal or open /api/debug/gemini for more detail.`,
            time: formatTime(),
          },
        ])
      } finally {
        if (!cancelled) {
          setIsTyping(false)
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [messages])

  function sendMessage(text) {
    const trimmed = text.trim()
    if (!trimmed || isTyping) return

    setMessages((current) => [
      ...current,
      {
        id: nextId.current++,
        role: 'user',
        text: trimmed,
        time: formatTime(),
      },
    ])
    setInput('')
  }

  function handleSubmit(event) {
    event.preventDefault()
    sendMessage(input)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" aria-hidden />
      <div className="ambient ambient-two" aria-hidden />
      <div className="app">
        <Header />
        <WelcomeCard onSuggestionClick={sendMessage} />

        <main className="chat-window">
          <div className="chat-scroll" ref={listRef} aria-live="polite" aria-relevant="additions">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isTyping && <TypingIndicator />}
          </div>
        </main>

        <form className="composer" onSubmit={handleSubmit}>
          <label className="composer-field">
            <span className="sr-only">Type your message</span>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Gemini anything..."
              rows={1}
            />
          </label>
          <button type="submit" disabled={!canSend}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
