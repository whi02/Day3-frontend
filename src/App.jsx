import { useState, useEffect } from 'react'
import './App.css'

// 서버 주소는 여기 한 곳에만 — 배포 때 이 한 줄만 Render 주소로 교체
const API_URL = 'http://localhost:3000'

function App() {
  const [messages, setMessages] = useState([])
  const [name, setName] = useState('')
  const [content, setContent] = useState('')

  // 화면이 뜨면 목록 받아오기
  useEffect(() => {
    fetch(`${API_URL}/messages`)
      .then((res) => res.json())
      .then((data) => setMessages(data))
  }, [])

  // 등록 버튼
  const handleSubmit = () => {
    fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    })
      .then((res) => res.json())
      .then((newMessage) => {
        // spread: 새 글을 앞에 붙인 '새 배열' (서버 정렬과 일치)
        setMessages([newMessage, ...messages])
        setName('')
        setContent('')
      })
  }

  return (
    <div>
      <h1>우리 팀 방명록</h1>
      <div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름"
        />
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="내용"
        />
        <button onClick={handleSubmit}>남기기</button>
      </div>
      <ul>
        {messages.map((msg) => (
          <li key={msg.id}>
            <strong>{msg.name}</strong>: {msg.content}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App