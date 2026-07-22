import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'

import './App.css'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const WALL = { width: 2400, height: 1600 }
const NOTE = { width: 200, height: 200 }
const ADD_NOTE_SLOT = { x: 36, y: 36 }
const COLOR_OPTIONS = [
  { id: 'yellow', label: '인사 · 다녀감', short: '인사', emoji: '👋' },
  { id: 'green', label: '응원', short: '응원', emoji: '🔥' },
  { id: 'blue', label: '팁 · 추천', short: '팁', emoji: '💡' },
  { id: 'red', label: '질문', short: '질문', emoji: '❓' },
  { id: 'purple', label: '같이 할 사람', short: '팀원 찾기', emoji: '🤝' },
]

const emptyForm = {
  authorName: localStorage.getItem('guestbook_author_name') || '',
  content: '',
  color: 'yellow',
  stackText: '',
  link: '',
  website: '',
}

function getAuthorToken() {
  let token = localStorage.getItem('author_token')
  if (!token) {
    if (typeof crypto.randomUUID === 'function') token = crypto.randomUUID()
    else {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      token = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
    }
    localStorage.setItem('author_token', token)
  }
  return token
}

const AUTHOR_TOKEN = getAuthorToken()

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'X-Author-Token': AUTHOR_TOKEN,
      ...options.headers,
    },
  })
  const isJson = response.headers.get('content-type')?.includes('application/json')
  const body = isJson ? await response.json() : null
  if (!response.ok) {
    const error = new Error(body?.error || '요청을 처리하지 못했습니다.')
    error.status = response.status
    error.retryAfter = body?.retryAfter
    throw error
  }
  return body
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function parseStack(text) {
  return [...new Set(text.split(',').map((item) => item.trim()).filter(Boolean))]
}

function validateNoteForm(form, { requireName = true } = {}) {
  const stack = parseStack(form.stackText)
  if (requireName && !form.authorName.trim()) return '닉네임을 입력해주세요.'
  if (!form.content.trim()) return '내용을 입력해주세요.'
  if (stack.length > 5) return '기술 스택은 5개까지입니다.'
  if (stack.some((item) => item.length > 20)) return '기술 스택은 각각 20자까지입니다.'
  if (form.link.trim()) {
    try {
      const link = new URL(form.link.trim())
      if (!['http:', 'https:'].includes(link.protocol)) throw new Error('invalid protocol')
    } catch {
      return '올바른 http(s) 링크를 입력해주세요.'
    }
  }
  return ''
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function notesOverlap(candidate, root, gap = 0) {
  return (
    candidate.x < root.x + NOTE.width + gap
    && candidate.x + NOTE.width + gap > root.x
    && candidate.y < root.y + NOTE.height + gap
    && candidate.y + NOTE.height + gap > root.y
  )
}

function findProtectedOverlap(candidate, roots, ignoredId = null) {
  return roots.find((root) => root.id !== ignoredId && !root.is_mine && notesOverlap(candidate, root)) || null
}

function findOpenPosition(roots) {
  const occupied = [ADD_NOTE_SLOT, ...roots]
  for (let y = 36; y <= WALL.height - NOTE.height; y += 220) {
    for (let x = 36; x <= WALL.width - NOTE.width; x += 220) {
      if (!occupied.some((root) => notesOverlap({ x, y }, root, 12))) return { x, y }
    }
  }
  return { x: 36, y: 36 }
}

function notePayload(form, extras = {}) {
  return {
    authorName: form.authorName.trim(),
    content: form.content.trim(),
    color: form.color,
    stack: parseStack(form.stackText),
    link: form.link.trim() || null,
    website: form.website,
    ...extras,
  }
}

function CorkPattern() {
  return (
    <div className="cork-pattern" aria-hidden="true">
      {Array.from({ length: 16 }, (_, index) => {
        const row = Math.floor(index / 4)
        const column = index % 4
        const className = [
          'cork-tile',
          column % 2 ? 'cork-flip-x' : '',
          row % 2 ? 'cork-flip-y' : '',
        ].filter(Boolean).join(' ')
        return <span className={className} key={index} />
      })}
    </div>
  )
}

function NoteCard({
  note,
  replies,
  writable,
  moving,
  dragging,
  blocked,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onThread,
  onMove,
  onConfirmMove,
  onCancelMove,
  onEdit,
  onDelete,
  onKeyDown,
  pending,
}) {
  const visibleStack = note.stack.slice(0, 2)
  const motionRef = useRef(null)
  const cardRef = useRef(null)

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const motionElement = motionRef.current
    const cardElement = cardRef.current
    const context = gsap.context(() => {
      gsap.fromTo(
        motionElement,
        { autoAlpha: 0, y: -52, scale: 0.84 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.68,
          delay: (Number(note.id) % 6) * 0.035,
          ease: 'back.out(1.45)',
          clearProps: 'transform,opacity,visibility',
        },
      )
    }, motionElement)
    return () => {
      gsap.killTweensOf(cardElement)
      context.revert()
    }
  }, [note.id])

  const animateHover = (event) => {
    if (moving || dragging || !window.matchMedia('(hover: hover)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const bounds = cardRef.current?.getBoundingClientRect()
    if (!bounds) return
    const horizontal = ((event.clientX - bounds.left) / bounds.width) - 0.5
    gsap.to(cardRef.current, {
      '--hover-tilt': `${horizontal * 3.2}deg`,
      '--note-lift': '-9px',
      '--note-scale': 1.035,
      duration: 0.24,
      ease: 'power2.out',
      overwrite: 'auto',
    })
  }

  const resetHover = () => {
    if (!cardRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.to(cardRef.current, {
      '--hover-tilt': '0deg',
      '--note-lift': '0px',
      '--note-scale': 1,
      duration: 0.4,
      ease: 'elastic.out(1, 0.55)',
      overwrite: 'auto',
    })
  }

  return (
    <div
      className={`note-shell ${moving ? 'is-moving' : ''} ${dragging ? 'is-dragging' : ''} ${blocked ? 'is-blocked' : ''}`}
      style={{ left: note.x, top: note.y, zIndex: Math.min(Number(note.z) || 1, 2_000_000_000) }}
      onPointerDown={moving ? onPointerDown : undefined}
      onPointerMove={(event) => moving ? onPointerMove?.(event) : animateHover(event)}
      onPointerUp={moving ? onPointerUp : undefined}
      onPointerCancel={moving ? onPointerUp : undefined}
      onPointerLeave={resetHover}
      tabIndex={moving ? 0 : undefined}
      data-moving-id={moving ? note.id : undefined}
      onKeyDown={moving ? onKeyDown : undefined}
      aria-label={moving ? '화살표 키로 포스트잇 위치 이동' : undefined}
      aria-invalid={blocked || undefined}
    >
      <div ref={motionRef} className="note-motion">
        {replies.map((reply, index) => (
          <div
            className={`reply-layer note-${reply.color}`}
            style={{ transform: `translate(${(index + 1) * 6}px, ${(index + 1) * 6}px)` }}
            key={reply.id}
            aria-hidden="true"
          />
        ))}
        <article
          ref={cardRef}
          className={`note-card note-${note.color}`}
          style={{ '--rotation': `${moving || dragging ? 0 : note.rotation}deg` }}
        >
        <span className="note-pin" aria-hidden="true" />
        <header className="note-meta">
          <span className="note-avatar" aria-hidden="true">{note.author_name.slice(0, 1)}</span>
          <div>
            <strong>{note.author_name}</strong>
            <time dateTime={note.created_at}>{formatDate(note.created_at)}</time>
          </div>
        </header>

        <p className="note-content">{note.content}</p>

        {visibleStack.length > 0 && (
          <div className="stack-chips">
            {visibleStack.map((item) => <span key={item}>#{item}</span>)}
            {note.stack.length > 2 && <span>+{note.stack.length - 2}</span>}
          </div>
        )}

        <footer className="note-actions">
          <button type="button" className="thread-button" onClick={onThread}>
            💬 {Number(note.reply_count ?? replies.length)}
          </button>
          {moving ? (
            <span className="owner-actions">
              <button type="button" className="mini-button" onClick={onCancelMove} disabled={pending}>취소</button>
              <button type="button" className="mini-button primary" onClick={onConfirmMove} disabled={pending || blocked} title={blocked ? '다른 사람의 방명록과 겹치지 않는 위치로 옮겨주세요' : undefined}>위치 확정</button>
            </span>
          ) : writable && note.is_mine ? (
            <span className="owner-actions">
              <button type="button" className="icon-button" onClick={onMove} aria-label="위치 바꾸기" disabled={pending}>↔</button>
              <button type="button" className="icon-button" onClick={onEdit} aria-label="내용 수정" disabled={pending}>✎</button>
              <button type="button" className="icon-button danger" onClick={onDelete} aria-label="포스트잇 삭제" disabled={pending}>×</button>
            </span>
          ) : null}
        </footer>
        </article>
      </div>
    </div>
  )
}

function DraftNote({ draft, dragging, blocked, saving, onPointerDown, onPointerMove, onPointerUp, onConfirm, onCancel, onKeyDown }) {
  return (
    <div
      className={`note-shell draft-shell is-moving ${dragging ? 'is-dragging' : ''} ${blocked ? 'is-blocked' : ''}`}
      style={{ left: draft.x, top: draft.y, zIndex: 2_000_000_001 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      tabIndex="0"
      onKeyDown={onKeyDown}
      aria-label="화살표 키로 새 포스트잇 위치 이동"
      aria-invalid={blocked || undefined}
    >
      <article className={`note-card note-${draft.color}`} style={{ '--rotation': '0deg' }}>
        <span className="draft-label">새 포스트잇</span>
        <span className="note-pin" aria-hidden="true" />
        <header className="note-meta">
          <span className="note-avatar">{draft.authorName.slice(0, 1)}</span>
          <div><strong>{draft.authorName}</strong><time>원하는 자리로 옮겨주세요</time></div>
        </header>
        <p className="note-content">{draft.content}</p>
        <div className="stack-chips">{parseStack(draft.stackText).slice(0, 2).map((item) => <span key={item}>#{item}</span>)}</div>
        <footer className="note-actions draft-actions">
          <button type="button" className="mini-button" onClick={onCancel}>취소</button>
          <button type="button" className="mini-button primary" onClick={onConfirm} disabled={saving || blocked} title={blocked ? '다른 사람의 방명록과 겹치지 않는 위치로 옮겨주세요' : undefined}>
            {saving ? '붙이는 중…' : '이 위치에 붙이기'}
          </button>
        </footer>
      </article>
    </div>
  )
}

function NoteFields({ form, setForm, compact = false }) {
  const stack = parseStack(form.stackText)
  return (
    <>
      <label>
        <span>닉네임</span>
        <input
          value={form.authorName}
          maxLength="20"
          onChange={(event) => setForm({ ...form, authorName: event.target.value })}
          placeholder="이름 또는 닉네임"
          required
        />
      </label>
      <label className="content-field">
        <span>{compact ? '답글' : '남기고 싶은 말'}</span>
        <textarea
          value={form.content}
          maxLength="200"
          onChange={(event) => setForm({ ...form, content: event.target.value })}
          placeholder={compact ? '이 포스트잇에 답글을 남겨보세요' : '인사, 응원, 질문을 포스트잇에 적어보세요.'}
          required
        />
        <small>{form.content.length} / 200</small>
      </label>
      <label>
        <span>기술 스택 <em>쉼표로 구분 · 최대 5개</em></span>
        <input
          value={form.stackText}
          onChange={(event) => setForm({ ...form, stackText: event.target.value })}
          placeholder="React, Node.js"
          aria-invalid={stack.length > 5}
        />
      </label>
      <label>
        <span>링크 <em>선택</em></span>
        <input
          type="url"
          value={form.link}
          onChange={(event) => setForm({ ...form, link: event.target.value })}
          placeholder="https://github.com/..."
        />
      </label>
      <input
        className="honeypot"
        name="website"
        value={form.website}
        onChange={(event) => setForm({ ...form, website: event.target.value })}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
    </>
  )
}

function ColorPicker({ value, onChange, compact = false }) {
  return (
    <div className={`color-picker ${compact ? 'compact' : ''}`} role="group" aria-label="포스트잇 색상">
      {COLOR_OPTIONS.map((color) => (
        <button
          type="button"
          key={color.id}
          className={`color-choice note-${color.id} ${value === color.id ? 'selected' : ''}`}
          onClick={() => onChange(color.id)}
          aria-label={color.label}
          aria-pressed={value === color.id}
          title={color.label}
        >
          <span>{color.emoji}</span>{!compact && <small>{color.short}</small>}
        </button>
      ))}
    </div>
  )
}

function AddNoteCard({ disabled, onClick }) {
  const cardRef = useRef(null)

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const cardElement = cardRef.current
    const context = gsap.context(() => {
      gsap.fromTo(cardElement, { autoAlpha: 0, y: -42, rotation: -9 }, { autoAlpha: 1, y: 0, rotation: -3, duration: 0.72, ease: 'back.out(1.7)' })
    }, cardElement)
    return () => {
      gsap.killTweensOf(cardElement)
      context.revert()
    }
  }, [])

  const hover = (event) => {
    if (disabled || !window.matchMedia('(hover: hover)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const bounds = cardRef.current.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width) - 0.5
    const y = ((event.clientY - bounds.top) / bounds.height) - 0.5
    gsap.to(cardRef.current, { rotationX: y * -7, rotationY: x * 8, y: -7, scale: 1.045, duration: 0.25, ease: 'power2.out', overwrite: 'auto' })
  }

  const reset = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.to(cardRef.current, { rotationX: 0, rotationY: 0, rotation: -3, y: 0, scale: 1, duration: 0.5, ease: 'elastic.out(1, .55)', overwrite: 'auto' })
  }

  return (
    <button
      ref={cardRef}
      type="button"
      className="add-note-card note-purple"
      onClick={onClick}
      onPointerMove={hover}
      onPointerLeave={reset}
      disabled={disabled}
    >
      <span className="note-pin" aria-hidden="true" />
      <span className="add-note-plus" aria-hidden="true">＋</span>
      <strong>방명록 추가하기</strong>
      <small>한 장 남겨주세요</small>
    </button>
  )
}

function CreateNoteDialog({ form, setForm, saving, error, onClose, onChoosePosition, onAutomatic }) {
  const backdropRef = useRef(null)
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  const savingRef = useRef(saving)

  useEffect(() => {
    closeRef.current = onClose
    savingRef.current = saving
  }, [onClose, saving])

  useLayoutEffect(() => {
    const context = gsap.context(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const timeline = gsap.timeline()
      timeline
        .fromTo(backdropRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.22 })
        .fromTo(dialogRef.current, { y: -70, scale: 0.72, rotation: -7 }, { y: 0, scale: 1, rotation: -1.4, duration: 0.62, ease: 'back.out(1.55)' }, 0.04)
    }, backdropRef)
    return () => context.revert()
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const close = (event) => event.key === 'Escape' && !savingRef.current && closeRef.current()
    window.addEventListener('keydown', close)
    document.body.style.overflow = 'hidden'
    const nameInput = dialogRef.current?.querySelector('input[name="authorName"]')
    const focusTarget = nameInput?.value ? 'textarea' : 'input[name="authorName"]'
    dialogRef.current?.querySelector(focusTarget)?.focus()
    return () => {
      window.removeEventListener('keydown', close)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div ref={backdropRef} className="composer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <form ref={dialogRef} className={`create-note-dialog note-${form.color}`} onSubmit={onChoosePosition} role="dialog" aria-modal="true" aria-labelledby="create-note-title">
        <span className="note-pin composer-pin" aria-hidden="true" />
        <header className="create-note-header">
          <div><span>NEW MESSAGE</span><h2 id="create-note-title">방명록 남기기</h2></div>
          <button type="button" className="close-button" onClick={onClose} disabled={saving} aria-label="방명록 작성 창 닫기">×</button>
        </header>

        <label className="paper-field">
          <span>이름</span>
          <input name="authorName" value={form.authorName} maxLength="20" onChange={(event) => setForm({ ...form, authorName: event.target.value })} placeholder="어떻게 불러드릴까요?" autoComplete="name" required />
        </label>
        <label className="paper-field message-field">
          <span>내용</span>
          <textarea value={form.content} maxLength="200" onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="이곳에 따뜻한 한마디를 남겨주세요." required />
          <small>{form.content.length} / 200</small>
        </label>

        <details className="note-extras">
          <summary>기술 스택이나 링크도 남길래요</summary>
          <label><span>기술 스택</span><input value={form.stackText} onChange={(event) => setForm({ ...form, stackText: event.target.value })} placeholder="React, Node.js" /></label>
          <label><span>링크</span><input type="url" value={form.link} onChange={(event) => setForm({ ...form, link: event.target.value })} placeholder="https://github.com/..." /></label>
        </details>

        <input className="honeypot" name="website" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} tabIndex={-1} autoComplete="off" aria-hidden="true" />

        <div className="create-note-color"><span>포스트잇 색상</span><ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} compact /></div>
        {error && <p className="composer-error" role="alert">{error}</p>}
        <div className="create-note-actions">
          <button type="button" className="paper-button secondary" onClick={onAutomatic} disabled={saving || !form.authorName.trim() || !form.content.trim()}>빈자리에 바로 붙이기</button>
          <button className="paper-button primary" disabled={saving || !form.authorName.trim() || !form.content.trim()}>{saving ? '준비하는 중…' : '붙일 위치 고르기'}</button>
        </div>
      </form>
    </div>
  )
}

function ThreadDrawer({ root, replies, writable, saving, onClose, onReply, onEdit, onDelete }) {
  const [form, setForm] = useState({ ...emptyForm, color: root.color })
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    const close = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const submit = async (event) => {
    event.preventDefault()
    const saved = await onReply(form)
    if (saved) setForm((current) => ({ ...emptyForm, authorName: current.authorName, color: current.color }))
  }

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="thread-drawer" role="dialog" aria-modal="true" aria-labelledby="thread-title">
        <header className="drawer-header">
          <div><span className="eyebrow">POST-IT THREAD</span><h2 id="thread-title" ref={titleRef} tabIndex="-1">{root.author_name}님의 포스트잇</h2></div>
          <button type="button" className="close-button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <article className={`thread-root note-${root.color}`}>
          <strong>{root.author_name}</strong>
          <p>{root.content}</p>
          {root.stack.length > 0 && <div className="detail-chips">{root.stack.map((item) => <span key={item}>#{item}</span>)}</div>}
          {root.link && <a href={root.link} target="_blank" rel="noreferrer">링크 열기 ↗</a>}
          <time>{formatDate(root.created_at)}</time>
        </article>

        <section className="reply-list" aria-label={`답글 ${replies.length}개`}>
          <div className="reply-heading"><h3>이어 붙인 답글</h3><span>{replies.length}</span></div>
          {replies.length === 0 ? <p className="empty-replies">아직 답글이 없어요.</p> : replies.map((reply) => (
            <article className={`reply-card note-${reply.color}`} key={reply.id}>
              <div><strong>{reply.author_name}</strong><time>{formatDate(reply.created_at)}</time></div>
              <p>{reply.content}</p>
              {reply.stack.length > 0 && <div className="detail-chips">{reply.stack.map((item) => <span key={item}>#{item}</span>)}</div>}
              {reply.link && <a href={reply.link} target="_blank" rel="noreferrer">링크 열기 ↗</a>}
              {writable && reply.is_mine && (
                <span className="reply-owner-actions">
                  <button type="button" onClick={() => onEdit(reply)} disabled={saving}>수정</button>
                  <button type="button" onClick={() => onDelete(reply)} disabled={saving}>삭제</button>
                </span>
              )}
            </article>
          ))}
        </section>

        {writable ? (
          <form className="reply-form" onSubmit={submit}>
            <h3>답글 포스트잇 붙이기</h3>
            <NoteFields form={form} setForm={setForm} compact />
            <div className="reply-form-bottom">
              <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} compact />
              <button className="primary-button small" disabled={saving || !form.authorName.trim() || !form.content.trim() || parseStack(form.stackText).length > 5}>
                {saving ? '붙이는 중…' : '답글 붙이기'}
              </button>
            </div>
          </form>
        ) : <p className="readonly-message">지난 달 벽의 답글은 읽기만 할 수 있어요.</p>}
      </aside>
    </div>
  )
}

function EditDialog({ note, saving, onClose, onSave }) {
  const dialogRef = useRef(null)
  const [form, setForm] = useState({
    ...emptyForm,
    authorName: note.author_name,
    content: note.content,
    color: note.color,
    stackText: note.stack.join(', '),
    link: note.link || '',
  })

  const submit = (event) => {
    event.preventDefault()
    onSave(form)
  }

  useEffect(() => {
    dialogRef.current?.querySelector('textarea')?.focus()
  }, [])

  useEffect(() => {
    const close = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form ref={dialogRef} className="edit-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <header><div><span className="eyebrow">EDIT POST-IT</span><h2 id="edit-title">포스트잇 고치기</h2></div><button type="button" className="close-button" onClick={onClose} aria-label="수정 창 닫기">×</button></header>
        <label className="content-field"><span>내용</span><textarea value={form.content} maxLength="200" onChange={(event) => setForm({ ...form, content: event.target.value })} required /><small>{form.content.length} / 200</small></label>
        <label><span>기술 스택</span><input value={form.stackText} onChange={(event) => setForm({ ...form, stackText: event.target.value })} /></label>
        <label><span>링크</span><input type="url" value={form.link} onChange={(event) => setForm({ ...form, link: event.target.value })} /></label>
        <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button className="primary-button" disabled={saving || !form.content.trim() || parseStack(form.stackText).length > 5}>{saving ? '저장 중…' : '수정 저장'}</button></div>
      </form>
    </div>
  )
}

function App() {
  const [walls, setWalls] = useState([])
  const [activeSlug, setActiveSlug] = useState('')
  const [notes, setNotes] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [composerOpen, setComposerOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const [moving, setMoving] = useState(null)
  const [drag, setDrag] = useState(null)
  const [selectedRootId, setSelectedRootId] = useState(null)
  const [editingNote, setEditingNote] = useState(null)
  const [filter, setFilter] = useState('all')
  const [initialLoading, setInitialLoading] = useState(true)
  const [wallLoading, setWallLoading] = useState(false)
  const [waking, setWaking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const pollBusy = useRef(false)
  const mutationBusy = useRef(false)
  const notesRequestId = useRef(0)
  const toastTimer = useRef(null)

  const activeWall = walls.find((wall) => wall.slug === activeSlug) || null
  const writable = Boolean(activeWall?.is_current)
  const roots = useMemo(() => notes.filter((note) => note.parent_id == null), [notes])
  const filteredRoots = useMemo(() => filter === 'all' ? roots : roots.filter((note) => note.color === filter), [filter, roots])
  const repliesByRoot = useMemo(() => {
    const grouped = new Map()
    notes.filter((note) => note.parent_id != null).forEach((reply) => {
      const list = grouped.get(reply.parent_id) || []
      list.push(reply)
      grouped.set(reply.parent_id, list)
    })
    return grouped
  }, [notes])
  const selectedRoot = roots.find((root) => root.id === selectedRootId) || null
  const selectedReplies = selectedRoot ? repliesByRoot.get(selectedRoot.id) || [] : []
  const protectedOverlap = useMemo(() => {
    const candidate = draft || moving
    if (!candidate) return null
    return findProtectedOverlap(candidate, roots, moving?.id ?? null)
  }, [draft, moving, roots])
  const placementBlocked = Boolean(protectedOverlap)

  const showToast = useCallback((message, tone = 'default') => {
    setToast({ message, tone })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }, [])

  const beginMutation = useCallback(() => {
    if (mutationBusy.current) return false
    mutationBusy.current = true
    notesRequestId.current += 1
    pollBusy.current = false
    setWallLoading(false)
    setSaving(true)
    return true
  }, [])

  const endMutation = useCallback(() => {
    mutationBusy.current = false
    setSaving(false)
  }, [])

  const loadNotes = useCallback(async (slug, { quiet = false } = {}) => {
    if (!slug) return false
    if (quiet && (pollBusy.current || mutationBusy.current)) return false
    const requestId = ++notesRequestId.current
    pollBusy.current = true
    if (!quiet) setWallLoading(true)
    try {
      const data = await request(`/walls/${slug}/notes`)
      if (requestId === notesRequestId.current) {
        setNotes(data)
        setError('')
      }
      return true
    } catch (loadError) {
      if (!quiet && requestId === notesRequestId.current) setError(loadError.message)
      return false
    } finally {
      if (requestId === notesRequestId.current) {
        pollBusy.current = false
        if (!quiet) setWallLoading(false)
      }
    }
  }, [])

  const initialize = useCallback(async () => {
    const wakeTimer = window.setTimeout(() => setWaking(true), 3000)
    try {
      const current = await request('/walls/current')
      const wallList = await request('/walls')
      setWalls(wallList)
      setActiveSlug(current.slug)
      const notesLoaded = await loadNotes(current.slug)
      if (!notesLoaded) return
      setError('')
      setInitialLoading(false)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      window.clearTimeout(wakeTimer)
      setWaking(false)
    }
  }, [loadNotes])

  useEffect(() => {
    const start = window.setTimeout(() => initialize(), 0)
    return () => window.clearTimeout(start)
  }, [initialize])

  useEffect(() => {
    if (!activeSlug || initialLoading || saving) return undefined
    const poll = window.setInterval(() => {
      if (!document.hidden && !mutationBusy.current) loadNotes(activeSlug, { quiet: true })
    }, 5000)
    return () => window.clearInterval(poll)
  }, [activeSlug, initialLoading, loadNotes, saving])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const changeWall = async (slug) => {
    if (mutationBusy.current || slug === activeSlug) return
    setActiveSlug(slug)
    setNotes([])
    setDraft(null)
    setComposerOpen(false)
    setMoving(null)
    setSelectedRootId(null)
    setEditingNote(null)
    setFilter('all')
    await loadNotes(slug)
  }

  const prepareDraft = (event) => {
    event.preventDefault()
    if (!writable) return
    const validationError = validateNoteForm(form)
    if (validationError) return setError(validationError)
    localStorage.setItem('guestbook_author_name', form.authorName.trim())
    const position = findOpenPosition(roots)
    setDraft({ ...form, ...position })
    setComposerOpen(false)
    setError('')
    window.requestAnimationFrame(() => {
      document.querySelector('.wall-scroll')?.scrollTo({ left: Math.max(position.x - 30, 0), top: Math.max(position.y - 30, 0), behavior: 'smooth' })
      document.querySelector('.draft-shell')?.focus()
    })
  }

  const saveRoot = async ({ automatic = false } = {}) => {
    if (!activeSlug || (!automatic && !draft)) return false
    if (!automatic && findProtectedOverlap(draft, roots)) {
      showToast('다른 사람의 방명록은 가릴 수 없어요!', 'warning')
      return false
    }
    const source = draft || form
    const validationError = validateNoteForm(source)
    if (validationError) {
      setError(validationError)
      return false
    }
    if (!beginMutation()) return false
    try {
      const position = automatic ? findOpenPosition(roots) : { x: draft.x, y: draft.y }
      const created = await request(`/walls/${activeSlug}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notePayload(source, { ...position, parentId: null })),
      })
      if (!String(source.website ?? '').trim()) {
        setNotes((current) => [...current, created].sort((a, b) => a.z - b.z))
      }
      localStorage.setItem('guestbook_author_name', source.authorName.trim())
      setForm((current) => ({ ...emptyForm, authorName: source.authorName.trim(), color: current.color }))
      setDraft(null)
      setComposerOpen(false)
      setError('')
      showToast('이번 달 벽에 포스트잇을 붙였어요!')
      return true
    } catch (saveError) {
      setError(saveError.message)
      return false
    } finally {
      endMutation()
    }
  }

  const beginDrag = (event, target) => {
    if (event.target.closest('button, a')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const source = target === 'draft' ? draft : moving
    setDrag({ target, pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startX: source.x, startY: source.y })
  }

  const moveDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const next = {
      x: clamp(Math.round(drag.startX + event.clientX - drag.startClientX), 0, WALL.width - NOTE.width),
      y: clamp(Math.round(drag.startY + event.clientY - drag.startClientY), 0, WALL.height - NOTE.height),
    }
    if (drag.target === 'draft') setDraft((current) => ({ ...current, ...next }))
    else setMoving((current) => ({ ...current, ...next }))
  }

  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const next = {
      x: clamp(Math.round(drag.startX + event.clientX - drag.startClientX), 0, WALL.width - NOTE.width),
      y: clamp(Math.round(drag.startY + event.clientY - drag.startClientY), 0, WALL.height - NOTE.height),
    }
    if (drag.target === 'draft') setDraft((current) => ({ ...current, ...next }))
    else setMoving((current) => ({ ...current, ...next }))
    const ignoredId = drag.target === 'moving' ? moving?.id : null
    if (findProtectedOverlap(next, roots, ignoredId)) {
      showToast('다른 사람의 방명록은 가릴 수 없어요!', 'warning')
    }
    setDrag(null)
  }

  const nudgePosition = (event, target) => {
    const direction = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }[event.key]
    if (!direction) return
    event.preventDefault()
    const distance = event.shiftKey ? 20 : 5
    const move = (current) => current ? {
      ...current,
      x: clamp(current.x + direction.x * distance, 0, WALL.width - NOTE.width),
      y: clamp(current.y + direction.y * distance, 0, WALL.height - NOTE.height),
    } : current
    if (target === 'draft') setDraft(move)
    else setMoving(move)
  }

  const startMove = (root) => {
    if (mutationBusy.current) return
    setDraft(null)
    setMoving({ id: root.id, x: root.x, y: root.y })
    showToast('포스트잇을 잡아 옮긴 뒤 위치를 확정해주세요.')
    window.requestAnimationFrame(() => document.querySelector(`[data-moving-id="${root.id}"]`)?.focus())
  }

  const confirmMove = async () => {
    if (!moving) return
    if (findProtectedOverlap(moving, roots, moving.id)) {
      showToast('다른 사람의 방명록은 가릴 수 없어요!', 'warning')
      return
    }
    if (!beginMutation()) return
    try {
      const updated = await request(`/notes/${moving.id}/position`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: moving.x, y: moving.y }),
      })
      setNotes((current) => current.map((note) => note.id === updated.id ? updated : note).sort((a, b) => a.z - b.z))
      setMoving(null)
      setError('')
      showToast('새 위치를 확정했어요.')
    } catch (moveError) {
      setError(moveError.message)
    } finally {
      endMutation()
    }
  }

  const createReply = async (replyForm) => {
    if (!selectedRoot) return false
    const validationError = validateNoteForm(replyForm)
    if (validationError) {
      setError(validationError)
      return false
    }
    if (!beginMutation()) return false
    try {
      const created = await request(`/walls/${activeSlug}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notePayload(replyForm, { parentId: selectedRoot.id })),
      })
      if (!String(replyForm.website ?? '').trim()) {
        setNotes((current) => current.map((note) => note.id === selectedRoot.id ? { ...note, reply_count: (Number(note.reply_count) || 0) + 1 } : note).concat(created))
      }
      localStorage.setItem('guestbook_author_name', replyForm.authorName.trim())
      setError('')
      showToast('답글을 이어 붙였어요.')
      return true
    } catch (replyError) {
      setError(replyError.message)
      return false
    } finally {
      endMutation()
    }
  }

  const saveEdit = async (editForm) => {
    if (!editingNote) return
    const validationError = validateNoteForm(editForm, { requireName: false })
    if (validationError) return setError(validationError)
    if (!beginMutation()) return
    try {
      const updated = await request(`/notes/${editingNote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editForm.content.trim(),
          color: editForm.color,
          stack: parseStack(editForm.stackText),
          link: editForm.link.trim() || null,
        }),
      })
      setNotes((current) => current.map((note) => note.id === updated.id ? updated : note))
      setEditingNote(null)
      setError('')
      showToast('포스트잇을 고쳤어요.')
    } catch (editError) {
      setError(editError.message)
    } finally {
      endMutation()
    }
  }

  const deleteNote = async (note) => {
    if (mutationBusy.current) return
    if (!window.confirm(note.parent_id == null ? '이 포스트잇과 모든 답글을 삭제할까요?' : '이 답글을 삭제할까요?')) return
    if (!beginMutation()) return
    try {
      await request(`/notes/${note.id}`, { method: 'DELETE' })
      setNotes((current) => current.filter((item) => item.id !== note.id && item.parent_id !== note.id).map((item) => item.id === note.parent_id ? { ...item, reply_count: Math.max(item.reply_count - 1, 0) } : item))
      if (selectedRootId === note.id) setSelectedRootId(null)
      setError('')
      showToast('포스트잇을 떼어냈어요.')
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      endMutation()
    }
  }

  if (initialLoading) {
    return (
      <main className="wake-screen">
        <div className="wake-note note-yellow"><span className="coffee">☕</span><h1>{waking ? '서버를 깨우는 중이에요 ☕' : '이번 달 벽을 찾고 있어요'}</h1><p>{waking ? '무료 서버가 기지개를 켜고 있어요. 처음에는 30~50초 정도 걸릴 수 있어요.' : '잠시만 기다려주세요.'}</p><div className="loading-dots"><i /><i /><i /></div></div>
        {error && <div className="wake-error"><span>{error}</span><button type="button" onClick={initialize}>다시 시도</button></div>}
      </main>
    )
  }

  const activeIndex = walls.findIndex((wall) => wall.slug === activeSlug)
  const newerWall = activeIndex > 0 ? walls[activeIndex - 1] : null
  const olderWall = activeIndex >= 0 && activeIndex < walls.length - 1 ? walls[activeIndex + 1] : null

  return (
    <main className="app-shell">
      <header className="guestbook-header">
        <div className="title-note">
          <span className="title-tape" aria-hidden="true" />
          <span>DEVELOPER GUESTBOOK</span>
          <h1>방명록</h1>
          <p>오늘의 흔적을 한 장 붙여주세요</p>
        </div>
      </header>

      <nav className="month-nav" aria-label="월별 방명록 벽">
        <button type="button" disabled={!olderWall || saving} onClick={() => olderWall && changeWall(olderWall.slug)}>← {olderWall?.slug || '이전 벽 없음'}</button>
        <div><strong>{activeWall?.title}</strong><span>{writable ? '이번 달 · 작성 가능' : '지난 벽 · 읽기 전용'}</span></div>
        <button type="button" disabled={!newerWall || saving} onClick={() => newerWall && changeWall(newerWall.slug)}>{newerWall?.slug || '다음 벽 없음'} →</button>
      </nav>

      <section className="wall-section" aria-labelledby="wall-title">
        <h2 id="wall-title" className="sr-only">{activeWall?.title} 개발자 방명록</h2>
        <div className="board-topline">
          <div className="board-controls">
            <div className="board-intro">
              <span>{activeWall?.title}</span>
              <strong>{wallLoading ? '포스트잇을 불러오는 중…' : `${filteredRoots.length}장의 이야기가 붙어 있어요`}</strong>
              <p>{draft ? '새 포스트잇을 원하는 자리로 옮긴 뒤 위치를 확정해주세요.' : '포스트잇의 답글 버튼을 누르면 이어진 이야기를 볼 수 있어요.'}</p>
            </div>
            <div className="filter-bar" role="group" aria-label="포스트잇 색상 필터">
              <button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체 <span>{roots.length}</span></button>
              {COLOR_OPTIONS.map((color) => (
                <button type="button" key={color.id} className={`${filter === color.id ? 'active' : ''} filter-${color.id}`} aria-label={`${color.label} ${roots.filter((root) => root.color === color.id).length}장`} aria-pressed={filter === color.id} onClick={() => setFilter(color.id)}>
                  <i aria-hidden="true" /> <span>{roots.filter((root) => root.color === color.id).length}</span>
                </button>
              ))}
            </div>
            <button type="button" className="refresh-button" onClick={() => loadNotes(activeSlug)} disabled={wallLoading || saving}>↻ 새로고침</button>
          </div>
        </div>

        {error && !composerOpen && <div className="error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>닫기</button></div>}

        <div className="wall-frame">
          <div className="wall-toolbar"><span>{activeSlug.replace('-', '.')} CORK BOARD</span><span className="scroll-tip">보드를 드래그하거나 스크롤해 둘러보세요</span></div>
          <div className="wall-scroll">
            <div className="wall" style={{ width: WALL.width, height: WALL.height }}>
              <CorkPattern />
              {writable ? (
                <AddNoteCard
                  disabled={saving || Boolean(draft) || Boolean(moving)}
                  onClick={() => { setError(''); setComposerOpen(true) }}
                />
              ) : (
                <div className="archive-note note-yellow"><strong>지난달 기록</strong><span>이 벽은 읽기 전용이에요</span></div>
              )}
              <div className="wall-stamp"><span>VISITOR NOTES</span><strong>{activeSlug.replace('-', ' · ')}</strong></div>
              {!wallLoading && filteredRoots.length === 0 && !draft && <div className="wall-empty"><span>아직 벽이 비어 있어요.</span><h3>{filter === 'all' ? '첫 포스트잇을 붙여주세요' : '이 색상의 포스트잇은 아직 없어요'}</h3><p>{writable ? '보드 위 추가 포스트잇을 눌러 시작할 수 있어요.' : '다른 필터를 선택해보세요.'}</p></div>}
              {filteredRoots.map((root) => {
                const replies = repliesByRoot.get(root.id) || []
                const shown = moving?.id === root.id ? { ...root, ...moving } : root
                return <NoteCard key={root.id} note={shown} replies={replies} writable={writable} moving={moving?.id === root.id} dragging={drag?.target === 'moving' && moving?.id === root.id} blocked={moving?.id === root.id && placementBlocked} onPointerDown={(event) => beginDrag(event, 'moving')} onPointerMove={moveDrag} onPointerUp={endDrag} onKeyDown={(event) => nudgePosition(event, 'moving')} pending={saving} onThread={() => setSelectedRootId(root.id)} onMove={() => startMove(root)} onConfirmMove={confirmMove} onCancelMove={() => setMoving(null)} onEdit={() => setEditingNote(root)} onDelete={() => deleteNote(root)} />
              })}
              {draft && <DraftNote draft={draft} dragging={drag?.target === 'draft'} blocked={placementBlocked} saving={saving} onPointerDown={(event) => beginDrag(event, 'draft')} onPointerMove={moveDrag} onPointerUp={endDrag} onKeyDown={(event) => nudgePosition(event, 'draft')} onConfirm={() => saveRoot()} onCancel={() => setDraft(null)} />}
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer"><span>한 달에 한 장씩 쌓이는 개발자들의 이야기</span><span>GUESTBOOK · {activeSlug}</span></footer>

      {composerOpen && <CreateNoteDialog form={form} setForm={setForm} saving={saving} error={error} onClose={() => setComposerOpen(false)} onChoosePosition={prepareDraft} onAutomatic={() => saveRoot({ automatic: true })} />}
      {selectedRoot && <ThreadDrawer root={selectedRoot} replies={selectedReplies} writable={writable} saving={saving} onClose={() => setSelectedRootId(null)} onReply={createReply} onEdit={(note) => { setSelectedRootId(null); setEditingNote(note) }} onDelete={deleteNote} />}
      {editingNote && <EditDialog note={editingNote} saving={saving} onClose={() => setEditingNote(null)} onSave={saveEdit} />}
      {toast && <div className={`toast toast-${toast.tone}`} role={toast.tone === 'warning' ? 'alert' : 'status'}>{toast.message}</div>}
    </main>
  )
}

export default App
