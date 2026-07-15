import { useState, useEffect } from 'react'
import './App.css'   // ⚠️ 이 줄 지우면 App.css 무시 (Day 1의 그 버그)

function App() {
  const API_URL = "https://team-00-back.onrender.com";
  
  // 방명록 목록 (서버에서 받아와 채움)
  const [messages, setMessages] = useState([])

  // 입력폼 2칸 — Day 1 입력폼과 동일 패턴 × 2
  const [name, setName] = useState("")
  const [content, setContent] = useState("")

  // 화면이 뜬 다음 목록 받아오기 (Day 2 패턴)
  useEffect(() => {
    fetch(`${API_URL}/messages`)
      .then((res) => res.json())
      .then((data) => setMessages(data))
  }, [])

  // 등록 버튼을 누르면 실행
  const handleSubmit = () => {
    fetch(`${API_URL}/messages`, {
      method: "POST",                                    // 이번엔 GET이 아니라 POST
      headers: { "Content-Type": "application/json" },   // "JSON 보냅니다" 표시
      body: JSON.stringify({ name, content }),           // 객체 → JSON 문자열
    })
      .then((res) => res.json())
      .then((newMessage) => {
        // newMessage = 서버가 RETURNING으로 돌려준 완성된 글 (id, created_at 포함)
        //
        // ★ 오늘의 새 문법: spread(...)
        // "기존 배열을 펼치고, 새 글을 앞에 붙인 '새 배열'을 만든다"
        // 새 글이 앞인 이유: 서버 정렬(최신이 위)과 화면을 맞추기 위해
        // messages.push(...)를 안 쓰는 이유: state는 직접 못 바꾼다 (Day 1: setCount와 같은 규칙)
        setMessages([newMessage, ...messages])

        setName("")      // 입력칸 비우기
        setContent("")
      })
  }

  // 삭제 버튼을 누르면 실행 (심화 미션)
  const handleDelete = (id) => {
    fetch(`${API_URL}/messages/${id}`, {   // 템플릿 리터럴 — Day 1 문법
      method: "DELETE",
    })
      .then((res) => res.json())
      .then(() => {
        // filter: "지운 id만 빼고 남긴 새 배열" — spread와 같은 원리 (직접 안 바꾸고 새로 만든다)
        setMessages(messages.filter((msg) => msg.id !== id))
      })
  }

  return (
    <div>
      <h1>우리 팀 방명록</h1>

      {/* 입력폼 — value + onChange 짝은 Day 1 입력폼 그대로 */}
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
            <button onClick={() => handleDelete(msg.id)}>삭제</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App