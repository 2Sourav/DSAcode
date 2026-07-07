import React, { useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'colorsplash-chat-sessions-v2'

const MODES = {
  study: {
    label: 'Study',
    accent: 'lime',
    prompt:
      'You are a patient study assistant. Explain ideas clearly, use examples, and end with one quick check-for-understanding question when helpful.',
    suggestions: [
      'Explain recursion like I am new to programming.',
      'Make a 5 point revision plan for arrays.',
      'Quiz me on JavaScript promises.',
    ],
  },
  code: {
    label: 'Code',
    accent: 'cyan',
    prompt:
      'You are a practical coding assistant. Give concise answers, include code when useful, explain tradeoffs, and avoid unnecessary jargon.',
    suggestions: [
      'Debug this React state issue.',
      'Write a binary search in JavaScript.',
      'Explain this API error step by step.',
    ],
  },
  creative: {
    label: 'Creative',
    accent: 'coral',
    prompt:
      'You are a creative writing partner. Offer vivid, useful ideas while keeping the tone natural and grounded.',
    suggestions: [
      'Write a short motivational quote.',
      'Give me 5 chatbot name ideas.',
      'Make this sentence sound more confident.',
    ],
  },
  interview: {
    label: 'Interview',
    accent: 'gold',
    prompt:
      'You are an interview prep coach. Ask sharp follow-up questions, explain strong answer structure, and keep feedback direct but encouraging.',
    suggestions: [
      'Ask me a React interview question.',
      'How should I answer tell me about yourself?',
      'Give me a DSA warmup question.',
    ],
  },
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function createBotMessage(text) {
  return {
    id: crypto.randomUUID(),
    role: 'bot',
    text,
    time: formatTime(),
  }
}

function createSession(mode = 'study') {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    mode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [
      createBotMessage('Hi, I am ready. Pick a mode, ask a question, or use one of the quick prompts to begin.'),
    ],
  }
}

function loadSessions() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (Array.isArray(stored) && stored.length > 0) {
      return stored
    }
  } catch {
    // Ignore malformed localStorage data and start fresh.
  }

  return [createSession()]
}

function getSessionTitle(text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 34 ? `${clean.slice(0, 34)}...` : clean || 'New chat'
}

function renderInline(text) {
  const parts = text.split(/(\*\*.*?\*\*)/g)

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }

    return <React.Fragment key={index}>{part}</React.Fragment>
  })
}

function renderTextBlock(text, keyPrefix) {
  const lines = text.split('\n')
  const elements = []
  let bulletItems = []

  function flushBullets() {
    if (bulletItems.length === 0) return
    elements.push(
      <ul key={`${keyPrefix}-list-${elements.length}`}>
        {bulletItems.map((item, index) => (
          <li key={`${keyPrefix}-item-${index}`}>{renderInline(item)}</li>
        ))}
      </ul>,
    )
    bulletItems = []
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    const bullet = trimmed.match(/^[-*]\s+(.+)/)
    const heading = trimmed.match(/^(#{1,3})\s+(.+)/)

    if (bullet) {
      bulletItems.push(bullet[1])
      return
    }

    flushBullets()

    if (!trimmed) {
      return
    }

    if (heading) {
      const Tag = heading[1].length === 1 ? 'h3' : 'h4'
      elements.push(<Tag key={`${keyPrefix}-heading-${index}`}>{renderInline(heading[2])}</Tag>)
      return
    }

    elements.push(<p key={`${keyPrefix}-p-${index}`}>{renderInline(line)}</p>)
  })

  flushBullets()
  return elements
}

function renderMessageText(text) {
  const sections = text.split(/```([\s\S]*?)```/g)

  return sections.map((section, index) => {
    if (index % 2 === 1) {
      const lines = section.replace(/^\n/, '').split('\n')
      const language = lines[0]?.trim().match(/^[a-zA-Z0-9+#.-]+$/) ? lines.shift().trim() : ''
      const code = lines.join('\n').trimEnd()

      return (
        <pre key={`code-${index}`} className="code-block">
          {language && <span className="code-language">{language}</span>}
          <code>{code}</code>
        </pre>
      )
    }

    return <React.Fragment key={`text-${index}`}>{renderTextBlock(section, `text-${index}`)}</React.Fragment>
  })
}

async function fetchChatReply(messages, mode) {
  const modeConfig = MODES[mode] || MODES.study
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: 'gemini',
      messages: [
        { role: 'system', text: modeConfig.prompt },
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

function Sidebar({ sessions, activeSessionId, onNewChat, onSelectSession, onDeleteSession }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">AI</div>
        <div>
          <p>Gemini Studio</p>
          <strong>Assistant</strong>
        </div>
      </div>

      <button className="new-chat-button" type="button" onClick={onNewChat}>
        + New chat
      </button>

      <div className="session-list" aria-label="Saved chats">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            className={`session-item ${session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            <span>{session.title}</span>
            <small>{MODES[session.mode]?.label || 'Chat'}</small>
            {sessions.length > 1 && (
              <span
                className="delete-session"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation()
                  onDeleteSession(session.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    onDeleteSession(session.id)
                  }
                }}
              >
                x
              </span>
            )}
          </button>
        ))}
      </div>
    </aside>
  )
}

function TopBar({ activeMode, onModeChange, onClearChat, isTyping }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Gemini powered</p>
        <h1>AI Study + Coding Assistant</h1>
      </div>

      <div className="topbar-actions">
        <div className="mode-tabs" aria-label="Assistant mode">
          {Object.entries(MODES).map(([mode, config]) => (
            <button
              key={mode}
              type="button"
              className={`mode-tab ${activeMode === mode ? 'active' : ''}`}
              data-accent={config.accent}
              onClick={() => onModeChange(mode)}
              disabled={isTyping}
            >
              {config.label}
            </button>
          ))}
        </div>
        <button className="ghost-button" type="button" onClick={onClearChat} disabled={isTyping}>
          Clear
        </button>
      </div>
    </header>
  )
}

function EmptyState({ mode, onSuggestionClick }) {
  const modeConfig = MODES[mode] || MODES.study

  return (
    <section className="empty-state">
      <div>
        <span className="mode-badge">{modeConfig.label}</span>
        <h2>What are we working on?</h2>
      </div>
      <div className="suggestion-grid">
        {modeConfig.suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="suggestion-card"
            onClick={() => onSuggestionClick(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  )
}

function MessageBubble({ message, onCopy, onRegenerate, copiedId, canRegenerate }) {
  const isUser = message.role === 'user'

  return (
    <article className={`message ${isUser ? 'from-user' : 'from-bot'}`}>
      {!isUser && <div className="avatar bot-avatar">AI</div>}
      <div className="message-body">
        <div className="message-meta">
          <span>{isUser ? 'You' : 'Gemini'}</span>
          <span>{message.time}</span>
        </div>
        <div className="bubble rich-text">{renderMessageText(message.text)}</div>
        {!isUser && (
          <div className="message-actions">
            <button type="button" onClick={() => onCopy(message)}>
              {copiedId === message.id ? 'Copied' : 'Copy'}
            </button>
            {canRegenerate && (
              <button type="button" onClick={onRegenerate}>
                Regenerate
              </button>
            )}
          </div>
        )}
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
          <span>thinking...</span>
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
  const [sessions, setSessions] = useState(loadSessions)
  const [activeSessionId, setActiveSessionId] = useState(() => sessions[0]?.id)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const listRef = useRef(null)

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0],
    [activeSessionId, sessions],
  )
  const messages = activeSession?.messages || []
  const hasUserMessages = messages.some((message) => message.role === 'user')
  const lastMessage = messages[messages.length - 1]
  const canSend = input.trim().length > 0 && !isTyping
  const canRegenerate = Boolean(lastMessage && lastMessage.role === 'bot' && hasUserMessages && !isTyping)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  }, [sessions])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [messages, isTyping])

  function updateActiveSession(updater) {
    setSessions((current) =>
      current.map((session) =>
        session.id === activeSession.id
          ? {
              ...updater(session),
              updatedAt: Date.now(),
            }
          : session,
      ),
    )
  }

  async function requestReply(nextMessages, mode = activeSession.mode) {
    setIsTyping(true)

    try {
      const reply = await fetchChatReply(nextMessages, mode)
      updateActiveSession((session) => ({
        ...session,
        messages: [...session.messages, createBotMessage(reply)],
      }))
    } catch (error) {
      updateActiveSession((session) => ({
        ...session,
        messages: [
          ...session.messages,
          createBotMessage(
            `I hit a server error: ${String(error?.message || error)} Check the server terminal or open /api/debug/gemini for more detail.`,
          ),
        ],
      }))
    } finally {
      setIsTyping(false)
    }
  }

  function sendMessage(text) {
    const trimmed = text.trim()
    if (!trimmed || isTyping) return

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmed,
      time: formatTime(),
    }
    const nextMessages = [...messages, userMessage]

    updateActiveSession((session) => ({
      ...session,
      title: session.title === 'New chat' ? getSessionTitle(trimmed) : session.title,
      messages: nextMessages,
    }))
    setInput('')
    requestReply(nextMessages)
  }

  function createNewChat(mode = activeSession?.mode || 'study') {
    const session = createSession(mode)
    setSessions((current) => [session, ...current])
    setActiveSessionId(session.id)
    setInput('')
  }

  function deleteSession(sessionId) {
    setSessions((current) => {
      const next = current.filter((session) => session.id !== sessionId)
      if (sessionId === activeSessionId) {
        setActiveSessionId(next[0]?.id)
      }
      return next.length > 0 ? next : [createSession()]
    })
  }

  function changeMode(mode) {
    updateActiveSession((session) => ({
      ...session,
      mode,
    }))
  }

  function clearChat() {
    updateActiveSession((session) => ({
      ...session,
      title: 'New chat',
      messages: [createBotMessage('Fresh chat ready. What should we tackle next?')],
    }))
  }

  function regenerateReply() {
    if (!canRegenerate) return

    const lastUserIndex = messages.map((message) => message.role).lastIndexOf('user')
    if (lastUserIndex === -1) return

    const nextMessages = messages.slice(0, lastUserIndex + 1)
    updateActiveSession((session) => ({
      ...session,
      messages: nextMessages,
    }))
    requestReply(nextMessages)
  }

  async function copyMessage(message) {
    await navigator.clipboard.writeText(message.text)
    setCopiedId(message.id)
    window.setTimeout(() => setCopiedId(null), 1500)
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
      <div className="app">
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSession.id}
          onNewChat={() => createNewChat()}
          onSelectSession={setActiveSessionId}
          onDeleteSession={deleteSession}
        />

        <main className="workspace">
          <TopBar
            activeMode={activeSession.mode}
            onModeChange={changeMode}
            onClearChat={clearChat}
            isTyping={isTyping}
          />

          <section className="chat-window">
            <div className="chat-scroll" ref={listRef} aria-live="polite" aria-relevant="additions">
              {!hasUserMessages && <EmptyState mode={activeSession.mode} onSuggestionClick={sendMessage} />}
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onCopy={copyMessage}
                  onRegenerate={regenerateReply}
                  copiedId={copiedId}
                  canRegenerate={canRegenerate && message.id === lastMessage?.id}
                />
              ))}
              {isTyping && <TypingIndicator />}
            </div>
          </section>

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
        </main>
      </div>
    </div>
  )
}
