import { useState, useRef, useEffect } from 'react'

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
  status: {
    fontSize: 12,
    color: THEME.textDim,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#4ADE80',
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
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    border: 'none',
    background: `linear-gradient(135deg, ${THEME.gold}, ${THEME.goldDim})`,
    color: THEME.bg,
    fontSize: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
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
}

const WELCOME = `Hello! I'm Tommy, your personal executive assistant.

I can help you with:
• Scheduling & calendar management
• Task tracking & reminders
• Quick notes & brainstorming
• Research & summaries

What can I help you with today?`

const QUICK_ACTIONS = [
  '📋 Today\'s agenda',
  '✅ Add a task',
  '📝 Quick note',
  '🔍 Research something',
]

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: WELCOME },
  ])
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = (text) => {
    const trimmed = (text || input).trim()
    if (!trimmed) return

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }])
    setInput('')

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Got it! You said: "${trimmed}"\n\nThis is a placeholder response. Connect Tommy to an AI backend to enable real conversations.`,
        },
      ])
    }, 600)
  }

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
        <div style={styles.status}>
          <div style={styles.statusDot} />
          Online
        </div>
      </header>

      <div style={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i} style={styles.message(msg.role === 'user')}>
            {msg.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

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

      <div style={styles.inputBar}>
        <textarea
          ref={inputRef}
          style={styles.input}
          rows={1}
          placeholder="Ask Tommy anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
        />
        <button style={styles.sendBtn} onClick={() => send()}>
          ↑
        </button>
      </div>
    </div>
  )
}
