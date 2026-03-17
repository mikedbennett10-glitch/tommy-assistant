import { useState, useRef, useEffect, useCallback } from 'react'

const THEME = {
  bg: '#0F0F13',
  surface: '#1A1A24',
  surfaceHover: '#22222E',
  border: '#2A2A3A',
  gold: '#D4A843',
  goldDim: '#B8912E',
  text: '#E8E8F0',
  textDim: '#8888A0',
  accent: '#6C5CE7',
  error: '#EF4444',
}

const API_URL_KEY = 'tommy_api_url'

function getApiUrl() {
  return localStorage.getItem(API_URL_KEY) || ''
}

// Parse SSE stream from Anthropic's Messages API
async function streamResponse(apiUrl, messages, onChunk, onDone, onError) {
  const controller = new AbortController()

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`API error ${res.status}: ${errText}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            onChunk(parsed.delta.text)
          }
        } catch {
          // skip unparseable lines
        }
      }
    }

    onDone()
  } catch (err) {
    if (err.name !== 'AbortError') {
      onError(err.message)
    }
  }

  return controller
}

const styles = {
  app: {
    minHeight: '100vh',
    background: THEME.bg,
    color: THEME.text,
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: `1px solid ${THEME.border}`,
    background: THEME.surface,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldDim})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 18,
    color: THEME.bg,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  status: {
    fontSize: 12,
    color: THEME.textDim,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: (connected) => ({
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: connected ? '#4ADE80' : THEME.textDim,
  }),
  settingsBtn: {
    background: 'none',
    border: 'none',
    color: THEME.textDim,
    fontSize: 18,
    cursor: 'pointer',
    padding: 4,
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  message: (isUser) => ({
    maxWidth: '80%',
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    background: isUser ? THEME.accent : THEME.surface,
    border: isUser ? 'none' : `1px solid ${THEME.border}`,
    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
    padding: '12px 16px',
    fontSize: 15,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  }),
  errorMsg: {
    alignSelf: 'center',
    background: 'rgba(239,68,68,0.1)',
    border: `1px solid ${THEME.error}`,
    borderRadius: 12,
    padding: '10px 16px',
    fontSize: 13,
    color: THEME.error,
    maxWidth: '90%',
  },
  typing: {
    alignSelf: 'flex-start',
    color: THEME.textDim,
    fontSize: 13,
    padding: '4px 0',
  },
  inputBar: {
    padding: '12px 16px',
    borderTop: `1px solid ${THEME.border}`,
    background: THEME.surface,
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    background: THEME.bg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 12,
    padding: '12px 16px',
    color: THEME.text,
    fontSize: 15,
    outline: 'none',
    resize: 'none',
    fontFamily: 'inherit',
    maxHeight: 120,
  },
  sendBtn: (disabled) => ({
    width: 44,
    height: 44,
    borderRadius: 12,
    border: 'none',
    background: disabled
      ? THEME.border
      : `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldDim})`,
    color: THEME.bg,
    fontSize: 20,
    cursor: disabled ? 'default' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  quickActions: {
    display: 'flex',
    gap: 8,
    padding: '0 20px 12px',
    overflowX: 'auto',
  },
  chip: {
    padding: '8px 14px',
    borderRadius: 20,
    border: `1px solid ${THEME.border}`,
    background: THEME.surface,
    color: THEME.textDim,
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  },
  // Settings modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: 16,
    padding: '24px',
    width: '90%',
    maxWidth: 420,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: THEME.textDim,
    marginBottom: 6,
    display: 'block',
  },
  modalInput: {
    width: '100%',
    background: THEME.bg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    color: THEME.text,
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  modalBtns: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  modalBtn: (primary) => ({
    padding: '8px 18px',
    borderRadius: 8,
    border: primary ? 'none' : `1px solid ${THEME.border}`,
    background: primary ? THEME.gold : 'transparent',
    color: primary ? THEME.bg : THEME.text,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  }),
}

const WELCOME = `Hello! I'm Tommy, your personal executive assistant.

I can help you with:
• Task management & prioritization
• Scheduling & time blocking
• Quick notes & brainstorming
• Research & summaries
• Decision support & planning

Tap the ⚙ icon to connect me to your AI backend, then let's get to work!`

const QUICK_ACTIONS = [
  '📋 What should I focus on today?',
  '✅ Help me plan a task',
  '📝 Quick note',
  '🔍 Research something for me',
]

function SettingsModal({ onClose }) {
  const [url, setUrl] = useState(getApiUrl())

  const save = () => {
    localStorage.setItem(API_URL_KEY, url.trim())
    onClose()
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalTitle}>Settings</div>
        <label style={styles.label}>Worker API URL</label>
        <input
          style={styles.modalInput}
          placeholder="https://tommy-api.your-subdomain.workers.dev"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          autoFocus
        />
        <div style={{ fontSize: 12, color: THEME.textDim, marginTop: 8 }}>
          Enter the URL of your deployed Cloudflare Worker.
        </div>
        <div style={styles.modalBtns}>
          <button style={styles.modalBtn(false)} onClick={onClose}>Cancel</button>
          <button style={styles.modalBtn(true)} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: WELCOME },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const connected = !!getApiUrl()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback((text) => {
    const trimmed = (text || input).trim()
    if (!trimmed || loading) return

    const apiUrl = getApiUrl()
    if (!apiUrl) {
      setShowSettings(true)
      return
    }

    const userMsg = { role: 'user', content: trimmed }
    const updatedMessages = [...messages, userMsg]

    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    // Only send user/assistant messages (skip the initial welcome for API calls)
    const apiMessages = updatedMessages
      .filter((_, i) => i > 0) // skip welcome message
      .map((m) => ({ role: m.role, content: m.content }))

    let assistantText = ''

    // Add empty assistant message that we'll stream into
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    streamResponse(
      apiUrl,
      apiMessages,
      (chunk) => {
        assistantText += chunk
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: assistantText }
          return updated
        })
      },
      () => {
        setLoading(false)
        inputRef.current?.focus()
      },
      (error) => {
        setMessages((prev) => {
          // Remove the empty assistant message, add error
          const updated = prev.slice(0, -1)
          return [...updated, { role: 'error', content: error }]
        })
        setLoading(false)
      },
    )
  }, [input, loading, messages])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>T</div>
          <span style={styles.logoText}>Tommy</span>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.status}>
            <div style={styles.statusDot(connected)} />
            {connected ? 'Connected' : 'Not configured'}
          </div>
          <button
            style={styles.settingsBtn}
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <div style={styles.messages}>
        {messages.map((msg, i) => {
          if (msg.role === 'error') {
            return <div key={i} style={styles.errorMsg}>{msg.content}</div>
          }
          return (
            <div key={i} style={styles.message(msg.role === 'user')}>
              {msg.content}
            </div>
          )
        })}
        {loading && messages[messages.length - 1]?.content === '' && (
          <div style={styles.typing}>Tommy is thinking...</div>
        )}
        <div ref={bottomRef} />
      </div>

      {!loading && messages.length <= 2 && (
        <div style={styles.quickActions}>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              style={styles.chip}
              onClick={() => send(action)}
              onMouseEnter={(e) => {
                e.target.style.borderColor = THEME.gold
                e.target.style.color = THEME.text
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = THEME.border
                e.target.style.color = THEME.textDim
              }}
            >
              {action}
            </button>
          ))}
        </div>
      )}

      <div style={styles.inputBar}>
        <textarea
          ref={inputRef}
          style={styles.input}
          rows={1}
          placeholder={connected ? 'Ask Tommy anything...' : 'Configure API in settings first...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button
          style={styles.sendBtn(loading || !input.trim())}
          onClick={() => send()}
          disabled={loading}
        >
          ↑
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
