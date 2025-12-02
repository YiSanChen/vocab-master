'use client'

import { useState, useEffect } from 'react'
import { supabase } from './utils/supabaseClient'

export default function Home() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('search') // 'search' | 'library' | 'practice'
  
  // --- 搜尋模式 State ---
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)

  // --- 單字庫模式 State ---
  const [myWords, setMyWords] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [selectedWord, setSelectedWord] = useState(null)

  // --- 練習模式 State ---
  const [practiceQueue, setPracticeQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [practiceFinished, setPracticeFinished] = useState(false)
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [allMastered, setAllMastered] = useState(false) // 新增：是否全部精通

  // 1. 檢查登入
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // 2. 切換視圖時觸發
  useEffect(() => {
    if (!user) return
    if (view === 'library') fetchLibrary()
    // 切換到練習模式時，預設不強制複習熟單字
    if (view === 'practice') startPracticeSession(false)
  }, [view, user])

  // --- API: 搜尋與加入 ---
  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true); setErrorMsg(''); setResult(null); setSaveStatus(null)
    try {
      const res = await fetch(`/api/dictionary?word=${query}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '查詢失敗')
      setResult(data)
    } catch (err) { setErrorMsg(err.message) } finally { setLoading(false) }
  }

  const addToLibrary = async () => {
    if (!user || !result) return
    setIsSaving(true)
    try {
      const { data: existingWords, error: checkError } = await supabase
        .from('user_vocabularies').select('id').eq('user_id', user.id).eq('word', result.word)
      if (checkError) throw checkError

      if (existingWords && existingWords.length > 0) {
        alert(`「${result.word}」已經在你的單字庫囉！`)
        setIsSaving(false); return
      }

      const { error: insertError } = await supabase.from('user_vocabularies').insert({
        user_id: user.id,
        word: result.word,
        definition_cn: result.definition,
        sentence_1_en: result.examples[0]?.en || '',
        sentence_1_cn: result.examples[0]?.cn || '',
        sentence_2_en: result.examples[1]?.en || '',
        sentence_2_cn: result.examples[1]?.cn || '',
        status: 0
      })
      if (insertError) throw insertError
      setSaveStatus('success')
      setTimeout(() => { setQuery(''); setResult(null); setSaveStatus(null) }, 1500)
    } catch (err) { console.error(err); setSaveStatus('error'); alert('加入失敗') } finally { setIsSaving(false) }
  }

  // --- API: 單字庫 ---
  const fetchLibrary = async () => {
    setLibraryLoading(true)
    const { data, error } = await supabase.from('user_vocabularies').select('*').order('created_at', { ascending: false })
    if (error) console.error(error)
    else setMyWords(data || [])
    setLibraryLoading(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('確定刪除？')) return
    const { error } = await supabase.from('user_vocabularies').delete().eq('id', id)
    if (!error) { setMyWords(prev => prev.filter(w => w.id !== id)); setSelectedWord(null) }
  }

  // --- API: 練習模式邏輯 (已更新) ---
  // forceReview: 是否強制複習所有單字 (包含熟單字)
  const startPracticeSession = async (forceReview = false) => {
    setPracticeLoading(true)
    setPracticeFinished(false)
    setAllMastered(false) // 重置狀態
    setCurrentIndex(0)
    setIsFlipped(false)

    // 抓取所有單字
    const { data, error } = await supabase.from('user_vocabularies').select('*')
    if (error) {
      console.error(error)
      setPracticeLoading(false)
      return
    }

    if (!data || data.length === 0) {
      setPracticeQueue([])
      setPracticeLoading(false)
      return
    }

    let targets = []

    if (forceReview) {
      // 如果強制複習，就使用全部資料
      targets = data
    } else {
      // 正常模式：只抓生字(0)和半熟(1)
      targets = data.filter(w => w.status < 2)
    }

    // 判斷邏輯更新：
    // 如果篩選後沒有單字，但原始資料庫其實有字 -> 代表全部都是「熟單字」
    if (targets.length === 0 && data.length > 0) {
      setAllMastered(true)
      setPracticeLoading(false)
      return
    }

    // 洗牌 (Fisher-Yates Shuffle)
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }

    setPracticeQueue(targets)
    setPracticeLoading(false)
  }

  const updateStatus = async (newStatus) => {
    const currentWord = practiceQueue[currentIndex]
    if (!currentWord) return

    // 1. 更新資料庫
    const { error } = await supabase
      .from('user_vocabularies')
      .update({ status: newStatus })
      .eq('id', currentWord.id)

    if (error) {
      console.error('Update status failed', error)
      alert('更新失敗')
      return
    }

    // 2. UI 轉場
    setTimeout(() => {
      setIsFlipped(false) // 先翻回正面
      setTimeout(() => {
        if (currentIndex < practiceQueue.length - 1) {
          setCurrentIndex(prev => prev + 1)
        } else {
          setPracticeFinished(true)
        }
      }, 300) // 等翻轉動畫做一半再換字
    }, 200)
  }

  // Auth
  const handleLogin = async () => { await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}` } }) }
  const handleLogout = async () => { await supabase.auth.signOut(); setResult(null); setQuery(''); setView('search') }

  // Helpers
  const getStatusColor = (status) => {
    if (status === 2) return 'bg-green-100 text-green-800 border-green-200'
    if (status === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    return 'bg-red-100 text-red-800 border-red-200'
  }
  const getStatusText = (status) => {
    if (status === 2) return '熟'
    if (status === 1) return '半熟'
    return '生'
  }

  if (!user) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <h1 className="text-3xl font-bold mb-2 text-gray-800">Vocab Master</h1>
        <button onClick={handleLogin} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition flex items-center justify-center gap-2 mt-8">使用 Google 登入</button>
      </div>
    </div>
  )

  const currentPracticeWord = practiceQueue[currentIndex]

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <span className="font-bold text-xl text-blue-600">Vocab Master</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 hidden sm:block">{user.email}</span>
              <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-500">登出</button>
            </div>
          </div>
          <div className="flex space-x-1 border-b border-gray-100">
            {['search', 'library', 'practice'].map((tab) => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  view === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'search' && '查單字'}
                {tab === 'library' && '單字庫'}
                {tab === 'practice' && '翻卡練習'}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto p-4 mt-4">
        
        {/* 1. Search Mode */}
        {view === 'search' && (
          <div className="animate-fade-in">
            <form onSubmit={handleSearch} className="mb-6 relative">
              {/* 修改 className: 加入 text-gray-900 讓輸入文字變黑 */}
              <input 
                type="text" 
                value={query} 
                onChange={(e) => setQuery(e.target.value)} 
                placeholder="輸入單字..." 
                className="w-full p-4 pl-5 rounded-xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg text-gray-900" 
              />
              <button type="submit" disabled={loading} className="absolute right-2 top-2 bottom-2 bg-blue-600 text-white px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition">{loading ? '...' : '查'}</button>
            </form>
            {errorMsg && <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 text-center">{errorMsg}</div>}
            {result && (
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-blue-50">
                  <h2 className="text-3xl font-bold text-gray-900 capitalize">{result.word}</h2>
                  <p className="text-xl text-blue-600 mt-1">{result.definition}</p>
                </div>
                <div className="p-6 space-y-4">
                  {result.examples.map((ex, idx) => (
                    <div key={idx} className="bg-gray-50 p-4 rounded-lg border-l-4 border-blue-200">
                      <p className="text-gray-800 mb-1 font-medium">{ex.en}</p>
                      <p className="text-gray-500 text-sm">{ex.cn}</p>
                    </div>
                  ))}
                </div>
                <div className="p-6 pt-0">
                  <button onClick={addToLibrary} disabled={isSaving || saveStatus === 'success'} className={`w-full py-4 rounded-xl font-bold text-lg transition ${saveStatus === 'success' ? 'bg-green-500 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                    {isSaving ? '儲存中...' : saveStatus === 'success' ? '✨ 已加入' : '＋ 加入單字庫'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Library Mode */}
        {view === 'library' && (
          <div className="animate-fade-in">
            {libraryLoading ? (
              <p className="text-center text-gray-500 mt-10">載入中...</p>
            ) : myWords.length === 0 ? (
              <div className="text-center text-gray-400 mt-20">
                <p>單字庫是空的</p>
                <button onClick={() => setView('search')} className="text-blue-500 hover:underline mt-2">去查幾個單字吧！</button>
              </div>
            ) : (
              <div className="grid gap-3">
                {myWords.map((item) => (
                  <div key={item.id} onClick={() => setSelectedWord(item)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center cursor-pointer hover:shadow-md transition hover:border-blue-200 group">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800 capitalize">{item.word}</h3>
                      <p className="text-gray-500 text-sm truncate max-w-[200px]">{item.definition_cn}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(item.status)}`}>{getStatusText(item.status)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. Practice Mode (Flip Card) */}
        {view === 'practice' && (
          <div className="h-[calc(100vh-200px)] flex flex-col items-center justify-center animate-fade-in">
            {practiceLoading ? (
              <p className="text-gray-500">準備牌組中...</p>
            ) : allMastered ? (
              // 新增：全部精通的恭喜畫面
              <div className="text-center p-8 bg-white rounded-2xl shadow-lg max-w-sm">
                <div className="text-6xl mb-4">🏆</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">太強了！全部精通</h2>
                <p className="text-gray-500 mb-8">你的單字庫中已經沒有生字囉。</p>
                <div className="flex flex-col gap-3">
                  <button onClick={() => startPracticeSession(true)} className="px-6 py-3 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition shadow-md">
                    複習熟單字
                  </button>
                  <button onClick={() => setView('search')} className="px-6 py-3 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition">
                    去新增更多單字
                  </button>
                </div>
              </div>
            ) : practiceFinished ? (
              <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
                <div className="text-6xl mb-4">🎉</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">練習結束！</h2>
                <p className="text-gray-500 mb-6">這組單字你都複習完了。</p>
                <button onClick={() => startPracticeSession(false)} className="px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition">
                  再來一輪
                </button>
              </div>
            ) : practiceQueue.length === 0 ? (
              <div className="text-center text-gray-400">
                <p>單字庫是空的，無法練習。</p>
                <button onClick={() => setView('search')} className="text-blue-500 hover:underline mt-2">去新增單字</button>
              </div>
            ) : currentPracticeWord && (
              <div className="relative w-full max-w-sm aspect-[3/4] perspective-1000">
                {/* 進度條 */}
                <div className="absolute -top-10 left-0 right-0 text-center text-gray-400 text-sm">
                  進度: {currentIndex + 1} / {practiceQueue.length}
                </div>

                {/* 卡片本體容器 */}
                <div 
                  className={`relative w-full h-full transition-transform duration-500 transform-style-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
                  onClick={() => !isFlipped && setIsFlipped(true)}
                >
                  
                  {/* === 正面 (Front) === */}
                  <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col items-center justify-center p-8 text-center hover:shadow-xl transition-shadow">
                    <div className="flex-1 flex flex-col items-center justify-center">
                      <h3 className="text-4xl font-bold text-gray-800 capitalize mb-8">{currentPracticeWord.word}</h3>
                      {/* 正面只有英文例句 */}
                      <div className="space-y-4 text-left w-full">
                        {currentPracticeWord.sentence_1_en && (
                          <p className="text-gray-600 text-lg leading-relaxed bg-gray-50 p-3 rounded-lg">
                            {currentPracticeWord.sentence_1_en}
                          </p>
                        )}
                        {currentPracticeWord.sentence_2_en && (
                          <p className="text-gray-600 text-lg leading-relaxed bg-gray-50 p-3 rounded-lg">
                            {currentPracticeWord.sentence_2_en}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-8 text-gray-400 text-sm animate-pulse">
                      點擊翻看答案 👆
                    </div>
                  </div>

                  {/* === 背面 (Back) === */}
                  <div className="absolute inset-0 backface-hidden rotate-y-180 bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col p-6 overflow-hidden">
                    {/* 內容區 (可滾動) */}
                    <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                      <div className="text-center border-b border-gray-100 pb-4">
                        <h3 className="text-3xl font-bold text-blue-600 capitalize">{currentPracticeWord.word}</h3>
                        <p className="text-xl text-gray-800 mt-2 font-medium">{currentPracticeWord.definition_cn}</p>
                      </div>
                      
                      {/* 雙語例句 */}
                      <div className="space-y-4">
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <p className="text-gray-800 font-medium mb-1">{currentPracticeWord.sentence_1_en}</p>
                          <p className="text-gray-500">{currentPracticeWord.sentence_1_cn}</p>
                        </div>
                        {currentPracticeWord.sentence_2_en && (
                          <div className="bg-blue-50 p-3 rounded-lg">
                            <p className="text-gray-800 font-medium mb-1">{currentPracticeWord.sentence_2_en}</p>
                            <p className="text-gray-500">{currentPracticeWord.sentence_2_cn}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 評分按鈕區 */}
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateStatus(0); }}
                        className="flex flex-col items-center justify-center p-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 hover:scale-105 transition"
                      >
                        <span className="text-2xl mb-1">🔴</span>
                        <span className="text-sm font-bold">生單字</span>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateStatus(1); }}
                        className="flex flex-col items-center justify-center p-3 rounded-xl bg-yellow-50 text-yellow-600 hover:bg-yellow-100 hover:scale-105 transition"
                      >
                        <span className="text-2xl mb-1">🟡</span>
                        <span className="text-sm font-bold">半熟</span>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateStatus(2); }}
                        className="flex flex-col items-center justify-center p-3 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 hover:scale-105 transition"
                      >
                        <span className="text-2xl mb-1">🟢</span>
                        <span className="text-sm font-bold">熟單字</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal - Library Details */}
      {selectedWord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedWord(null)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-scale-up" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 bg-blue-50 flex justify-between items-start">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 capitalize">{selectedWord.word}</h2>
                <p className="text-xl text-blue-600 mt-1">{selectedWord.definition_cn}</p>
              </div>
              <button onClick={() => handleDelete(selectedWord.id)} className="text-red-400 hover:text-red-600 p-2 text-sm">刪除</button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-gray-400">目前狀態：</span>
                <span className={`text-xs px-3 py-1 rounded-full border ${getStatusColor(selectedWord.status)}`}>{getStatusText(selectedWord.status)}</span>
              </div>
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-800 font-medium mb-1">{selectedWord.sentence_1_en}</p>
                  <p className="text-gray-500 text-sm">{selectedWord.sentence_1_cn}</p>
                </div>
                {selectedWord.sentence_2_en && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-gray-800 font-medium mb-1">{selectedWord.sentence_2_en}</p>
                    <p className="text-gray-500 text-sm">{selectedWord.sentence_2_cn}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 text-center">
              <button onClick={() => setSelectedWord(null)} className="text-blue-600 font-bold hover:bg-blue-100 px-6 py-2 rounded-full transition">關閉</button>
            </div>
          </div>
        </div>
      )}

      {/* Tailwind 3D Utilities (Inline Styles for simplicity) */}
      <style jsx global>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  )
}