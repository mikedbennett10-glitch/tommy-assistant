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
  green: '#4ADE80',
}

const API_URL_KEY = 'tommy_api_url'

function getApiUrl() {
  return localStorage.getItem(API_URL_KEY) || ''
}

async function sendMessage(apiUrl, messages) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.text
}

async function checkCalendarStatus(apiUrl) {
  try {
    const res = await fetch(`${apiUrl}/oauth/status`)
    const data = await res.json()
    return data.connected
  } catch {
    return false
  }
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
    gap: 10,
  },
  iconBtn: (active) => ({
    background: 'none',
    border: 'none',
    color: active ? THEME.green : THEME.textDim,
    fontSize: 18,
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  }),
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
    background: connected ? THEME.green : THEME.textDim,
  }),
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
  calendarSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTop: `1px solid ${THEME.border}`,
  },
  calStatusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  calStatus: (connected) => ({
    fontSize: 13,
    color: connected ? THEME.green : THEME.textDim,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }),
  connectBtn: {
    padding: '6px 14px',
    borderRadius: 8,
    border: `1px solid ${THEME.border}`,
    background: THEME.bg,
    color: THEME.text,
    fontSize: 13,
    cursor: 'pointer',
  },
}

const WELCOME = `Hello! I'm Tommy, your personal executive assistant.

I can help you with:
• Scheduling & calendar management
• Task tracking & reminders
• Quick notes & brainstorming
• Research & summaries

Tap ⚙ to connect your API, then 📅 to link your Google Calendar. Let's get to work!`

const QUICK_ACTIONS = [
  '📋 What\'s on my calendar today?',
  '✅ Help me plan a task',
  '📝 Quick note',
  '🔍 Research something for me',
]

function SettingsModal({ onClose, calendarConnected, onCalendarRefresh }) {
  const [url, setUrl] = useState(getApiUrl())

  const save = () => {
    localStorage.setItem(API_URL_KEY, url.trim())
    onClose()
  }

  const connectCalendar = () => {
    const apiUrl = url.trim() || getApiUrl()
    if (!apiUrl) {
      alert('Set the Worker API URL first.')
      return
    }
    window.open(`${apiUrl}/oauth/start`, '_blank', 'width=500,height=700')
    // Poll for connection
    const interval = setInterval(async () => {
      const connected = await checkCalendarStatus(apiUrl)
      if (connected) {
        clearInterval(interval)
        onCalendarRefresh()
      }
    }, 2000)
    setTimeout(() => clearInterval(interval), 120000)
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

        <div style={styles.calendarSection}>
          <label style={styles.label}>Google Calendar</label>
          <div style={styles.calStatusRow}>
            <div style={styles.calStatus(calendarConnected)}>
              <div style={styles.statusDot(calendarConnected)} />
              {calendarConnected ? 'Connected' : 'Not connected'}
            </div>
            {!calendarConnected && (
              <button style={styles.connectBtn} onClick={connectCalendar}>
                Connect Calendar
              </button>
            )}
          </div>
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
  const [calendarConnected, setCalendarConnected] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const apiUrl = getApiUrl()
  const connected = !!apiUrl

  // Check calendar status on load
  useEffect(() => {
    if (apiUrl) {
      checkCalendarStatus(apiUrl).then(setCalendarConnected)
    }
  }, [apiUrl])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async (text) => {
    const trimmed = (text || input).trim()
    if (!trimmed || loading) return

    const currentApiUrl = getApiUrl()
    if (!currentApiUrl) {
      setShowSettings(true)
      return
    }

    const userMsg = { role: 'user', content: trimmed }
    const updatedMessages = [...messages, userMsg]

    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    // Only send user/assistant messages (skip welcome and errors)
    const apiMessages = updatedMessages
      .filter((m, i) => i > 0 && (m.role === 'user' || m.role === 'assistant') && m.content)
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const responseText = await sendMessage(currentApiUrl, apiMessages)
      setMessages((prev) => [...prev, { role: 'assistant', content: responseText }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'error', content: err.message }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
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
          <button
            style={styles.iconBtn(calendarConnected)}
            onClick={() => {
              if (!calendarConnected) setShowSettings(true)
            }}
            title={calendarConnected ? 'Calendar connected' : 'Connect calendar'}
          >
            📅
          </button>
          <div style={styles.status}>
            <div style={styles.statusDot(connected)} />
            {connected ? 'Online' : 'Setup needed'}
          </div>
          <button
            style={styles.iconBtn(false)}
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
        {loading && (
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
          placeholder={connected ? 'Ask Tommy anything...' : 'Configure API in settings...'}
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

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          calendarConnected={calendarConnected}
          onCalendarRefresh={() => setCalendarConnected(true)}
        />
      )}
    </div>
  )
}
